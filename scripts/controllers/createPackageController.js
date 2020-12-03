import ContainerController from '../../cardinal/controllers/base-controllers/ContainerController.js';
import Package from '../models/Package.js';
import GTIN_DSU_Builder from "../services/DSU_Builder.js";
import Batch from "../models/Batch.js";
import Countries from "../models/Countries.js";
import StorageService from '../services/StorageService.js';
import constants from "../constants.js";

const gtin_dsu_builder = new GTIN_DSU_Builder();

export default class createPackageController extends ContainerController {
    constructor(element, history) {
        super(element);

        this.setModel({});
        this.storageService = new StorageService(this.DSUStorage);

        this.model.package = new Package();

        this.storageService.getItem(constants.BATCHES_STORAGE_PATH, "json", (err, batches) => {
            if(err){
                return console.log("Error", err);
            }

            if(batches === null || typeof batches === "undefined"){
                batches = [];
            }

            let options = [];
            batches.forEach(batch => options.push(new Batch(batch).generateViewModel()));
            this.model.batches = {
                label: "Batch",
                placeholder: "Select a batch",
                options: options
            };
        });

        this.on('openFeedback', (e) => {
            this.feedbackEmitter = e.detail;
        });

        this.model.onChange("batches.value", (event)=>{
            this.storageService.getItem(constants.BATCHES_STORAGE_PATH, "json", (err, batches) => {
                let batch = batches.find(batch => batch.batchNumber === this.model.batches.value);
                this.model.expiryForDisplay = batch.expiryForDisplay;
                this.model.country = Countries.getCountry(batch.country);
                this.model.selectedBatch = batch;

                this.storageService.getItem(constants.PRODUCTS_STORAGE_PATH, "json", (err, products) => {
                    if(err){
                        console.log(err);
                    }

                    if(Array.isArray(products)){
                        let product = products.find((product)=>{
                            return product.keySSI === batch.product;
                        });

                        this.model.gtin = product.gtin;
                    }
                })
            });
        })

        this.on("save-package", (event) => {
            let pack = {gtin: this.model.gtin, batch: this.model.selectedBatch.batchNumber, product: this.model.selectedBatch.keySSI};
            let expirationDate = new Date(this.model.selectedBatch.expiryForDisplay);
            const ye = new Intl.DateTimeFormat('en', { year: '2-digit' }).format(expirationDate);
            const mo = new Intl.DateTimeFormat('en', { month: '2-digit' }).format(expirationDate);
            const da = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(expirationDate);
            pack.expiryForDisplay = `${ye}${mo}${da}`;
            pack.serialNumber = this.model.package.serialNumber;

            this.showLoadingModal();
            this.buildPackageDSU(pack, (err, gtinSSI)=>{
                if (err) {
                    this.hideLoadingModal();
                    this.showError(err, "PackageDSU build failed.");
                    return;
                }
                console.log("Package was created.", gtinSSI);
                pack.keySSI = gtinSSI;
                this.persistPack(pack, (err) => {
                    if(err){
                        this.hideLoadingModal();
                        this.showError(err, "Persist Package failed.");
                    }

                    this.hideLoadingModal();
                    this.History.navigateToPageByTag("packages");
                });
            });
        });
    }

    buildPackageDSU(pack, callback) {
        gtin_dsu_builder.getTransactionId((err, transactionId)=>{
            if(err){
                return callback(err);
            }
            gtin_dsu_builder.setGtinSSI(transactionId, constants.DOMAIN_NAME, pack.gtin, pack.batch, pack.expiryForDisplay,(err)=>{
                if(err){
                    return callback(err);
                }
                gtin_dsu_builder.addFileDataToDossier(transactionId, "package.json", JSON.stringify(pack), (err)=>{
                    if (err) {
                        return callback(err);
                    }
                    gtin_dsu_builder.mount(transactionId, "/batch", pack.product, (err)=>{
                        if(err){
                            return callback(err);
                        }

                        gtin_dsu_builder.buildDossier(transactionId, callback);
                    });
                });
            });
        });
    }

    persistPack(pack, callback){
        this.storageService.getItem(constants.PACKAGES_STORAGE_PATH, 'json', (err, packs) => {
            if (err) {
                //todo: improve error handling here
               return callback(err);
            }

            if (typeof packs === "undefined" || packs === null) {
                packs = [];
            }

            packs.push(pack);
            this.storageService.setItem(constants.PACKAGES_STORAGE_PATH, JSON.stringify(packs), callback);
        });
    }

    showError(err, title, type) {
        let errMessage;
        title = title ? title : 'Validation Error';
        type = type ? type : 'alert-danger';

        if (err instanceof Error) {
            errMessage = err.message;
        } else if (typeof err === 'object') {
            errMessage = err.toString();
        } else {
            errMessage = err;
        }
        this.feedbackEmitter(errMessage, title, type);
    }

    showLoadingModal() {
        this.showModal('loadingModal', {
            title: 'Loading...',
            description: 'We are creating your package right now ...'
        });
    }

    hideLoadingModal() {
        this.element.dispatchEvent(new Event('closeModal'));
    }
}
