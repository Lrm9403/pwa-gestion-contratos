class Database {
    constructor() {
        this.dbName = 'ContractManagerDB';
        this.version = 1; // Versión simplificada
        this.db = null;
        this.initPromise = this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error("IndexedDB no está soportado"));
                return;
            }

            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = (event) => {
                console.error("Error al abrir IndexedDB:", event.target.error);
                reject(event.target.error);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("Base de datos inicializada correctamente");
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                console.log("Creando/Actualizando base de datos");
                const db = event.target.result;
                
                // Crear object stores solo si no existen
                const stores = [
                    { name: 'users', keyPath: 'id', indexes: ['email'] },
                    { name: 'companies', keyPath: 'id', indexes: ['userId'] },
                    { name: 'contracts', keyPath: 'id', indexes: ['companyId', 'userId'] },
                    { name: 'certifications', keyPath: 'id', indexes: ['contractId', 'companyId', 'userId'] },
                    { name: 'payments', keyPath: 'id', indexes: ['contractId', 'companyId', 'userId', 'certificationId'] },
                    { name: 'activities', keyPath: 'id', indexes: ['companyId', 'userId'] }
                ];
                
                stores.forEach(storeConfig => {
                    if (!db.objectStoreNames.contains(storeConfig.name)) {
                        const store = db.createObjectStore(storeConfig.name, { 
                            keyPath: storeConfig.keyPath 
                        });
                        
                        // Crear índices
                        storeConfig.indexes.forEach(index => {
                            store.createIndex(index, index, { unique: false });
                        });
                    }
                });
            };
        });
    }

    async ready() {
        return this.initPromise;
    }

    // Métodos genéricos simplificados
    async add(storeName, data) {
        await this.ready();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            // Generar ID único
            const id = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const item = { ...data, id };
            
            const request = store.add(item);
            
            request.onsuccess = () => resolve(id);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async update(storeName, id, data) {
        await this.ready();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put({ ...data, id });
            
            request.onsuccess = () => resolve(id);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async delete(storeName, id) {
        await this.ready();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve(id);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async get(storeName, id) {
        await this.ready();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getAll(storeName, indexName = null, value = null) {
        await this.ready();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            
            let request;
            if (indexName && value) {
                const index = store.index(indexName);
                request = index.getAll(value);
            } else {
                request = store.getAll();
            }
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Métodos específicos
    async getUserByEmail(email) {
        const users = await this.getAll('users');
        return users.find(user => user.email === email);
    }

    async getCompaniesByUser(userId) {
        return await this.getAll('companies', 'userId', userId);
    }

    async getContractsByCompany(companyId) {
        return await this.getAll('contracts', 'companyId', companyId);
    }

    async getCertificationsByContract(contractId) {
        return await this.getAll('certifications', 'contractId', contractId);
    }

    async getPaymentsByCompany(companyId) {
        return await this.getAll('payments', 'companyId', companyId);
    }

    async addActivity(activity) {
        return await this.add('activities', {
            ...activity,
            timestamp: new Date().toISOString(),
            synced: false
        });
    }

    async clearDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.dbName);
            
            request.onsuccess = () => {
                console.log("Base de datos eliminada");
                resolve();
            };
            
            request.onerror = (e) => {
                console.error("Error al eliminar base de datos:", e.target.error);
                reject(e.target.error);
            };
        });
    }
}

// Crear instancia global
const db = new Database();
