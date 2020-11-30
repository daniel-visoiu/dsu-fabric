import utils from "./utils.js";

const doPost = utils.getPostHandlerFor("dsu-wizard");

export default class DSU_Builder {
    constructor() {
        let crypto = require("opendsu").loadApi("crypto");
        let http = require("opendsu").loadApi("http");

        http.registerInterceptor((data, callback)=>{
            let {url, headers} = data;
            let scope = "";

            crypto.createPresentationToken(this.holderInfo.ssi, scope, this.credential, (err, presentationToken)=>{
                if(err){
                    return callback(err);
                }

                headers["Authorisation"] = presentationToken;
                return callback(undefined, {url, headers});
            });

        });
    }

    getTransactionId(callback) {

        function getJSON(pth, callback){
            fetch(pth).then((response) => {
                return response.json();
            }).then((json) => {
                return callback(undefined, json)
            }).catch(callback);
        }

        let obtainTransaction = ()=>{
            doPost(`/${this.holderInfo.domain}/begin`, (err, transactionId) => {
                if (err) {
                    return callback(err);
                }
                const url = `/${this.holderInfo.domain}/setDLDomain/${transactionId}`;
                doPost(url, this.holderInfo.domain, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    return callback(undefined, transactionId);
                });
            });
        }

        if (typeof this.holderInfo === "undefined" || typeof this.credential === "undefined") {
            getJSON("/download/myKeys/holder.json", (err, holderInfo) => {
                if(err){
                    return callback("No holder info available!");
                }
                this.holderInfo = holderInfo;

                getJSON("/download/myKeys/credential.json", (err, result)=>{
                    if(err){
                        return callback("No credentials available!");
                    }
                    this.credential = result.credential;

                    obtainTransaction();
                });
            });

            return;
        }

        obtainTransaction();
    }

    setKeySSI(transactionId, keyssi, callback) {
        const url = `/${this.holderInfo.domain}/setKeySSI/${transactionId}`;
        doPost(url, keyssi, callback);
    }

    setGtinSSI(transactionId, dlDomain, gtin, batch, expiration, callback) {
        const body = {dlDomain, gtin, batch, expiration}
        const url = `/${this.holderInfo.domain}/gtin/${transactionId}`;
        doPost(url, JSON.stringify(body), callback);
    }

    addFileDataToDossier(transactionId, fileName, fileData, callback) {
        const url = `/${this.holderInfo.domain}/addFile/${transactionId}`;

        if (fileData instanceof ArrayBuffer) {
            fileData = new Blob([new Uint8Array(fileData)], {type: "application/octet-stream"});
        }
        let body = new FormData();
        let inputType = "file";
        body.append(inputType, fileData);

        doPost(url, body, {headers: {"x-dossier-path": fileName}}, callback);
    }

    mount(transactionId, path, seed, callback) {
        const url = `/${this.holderInfo.domain}/mount/${transactionId}`;
        doPost(url, "", {
            headers: {
                'x-mount-path': path,
                'x-mounted-dossier-seed': seed
            }
        }, callback);
    }

    buildDossier(transactionId, callback) {
        const url = `/${this.holderInfo.domain}/build/${transactionId}`;
        doPost(url, "", callback);
    }
}