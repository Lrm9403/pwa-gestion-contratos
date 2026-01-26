class Database {
    constructor() {
        this.dbName = 'ContractManagerDB';
        this.version = 3; // Incrementado a 3
        this.db = null;
        this.initPromise = this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error("IndexedDB no está soportado en este navegador"));
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
                console.log("Actualizando base de datos a versión:", this.version);
                const db = event.target.result;
                
                // Crear tablas solo si no existen
                this.createObjectStore(db, 'users', 'id', ['email']);
                this.createObjectStore(db, 'companies', 'id', ['userId']);
                this.createObjectStore(db, 'contracts', 'id', ['companyId', 'userId']);
                this.createObjectStore(db, 'certifications', 'id', ['contractId', 'companyId', 'userId']);
                this.createObjectStore(db, 'invoices', 'id', ['contractId', 'companyId', 'userId']);
                this.createObjectStore(db, 'payments', 'id', ['certificationId', 'companyId', 'userId', 'contractId']);
                this.createObjectStore(db, 'activities', 'id', ['companyId', 'userId']);
            };
        });
    }

    createObjectStore(db, name, keyPath, indexes = []) {
        if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: keyPath, autoIncrement: false });
            indexes.forEach(index => {
                if (!store.indexNames.contains(index)) {
                    store.createIndex(index, index, { unique: false });
                }
            });
        }
    }

    async ready() {
        return this.initPromise;
    }

    // Métodos genéricos
    add(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Base de datos no inicializada"));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            // Generar ID único
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            const item = { ...data, id };
            
            const request = store.add(item);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(id);
            
            transaction.oncomplete = () => {
                console.log(`Elemento añadido a ${storeName}:`, id);
            };
        });
    }

    update(storeName, id, data) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Base de datos no inicializada"));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put({ ...data, id });
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    delete(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Base de datos no inicializada"));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    get(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Base de datos no inicializada"));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    getAll(storeName, indexName = null, value = null) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Base de datos no inicializada"));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            
            let request;
            if (indexName && value !== null) {
                const index = store.index(indexName);
                request = index.getAll(value);
            } else {
                request = store.getAll();
            }
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || []);
        });
    }

    // Métodos específicos para la aplicación
    async getUserByEmail(email) {
        try {
            const users = await this.getAll('users');
            return users.find(user => user.email === email);
        } catch (error) {
            console.error('Error al buscar usuario por email:', error);
            return null;
        }
    }

    async getCompaniesByUser(userId) {
        try {
            return await this.getAll('companies', 'userId', userId);
        } catch (error) {
            console.error('Error al buscar empresas:', error);
            return [];
        }
    }

    async getContractsByCompany(companyId) {
        try {
            return await this.getAll('contracts', 'companyId', companyId);
        } catch (error) {
            console.error('Error al buscar contratos:', error);
            return [];
        }
    }

    async getCertificationsByContract(contractId) {
        try {
            return await this.getAll('certifications', 'contractId', contractId);
        } catch (error) {
            console.error('Error al buscar certificaciones:', error);
            return [];
        }
    }

    async getPaymentsByCompany(companyId) {
        try {
            return await this.getAll('payments', 'companyId', companyId);
        } catch (error) {
            console.error('Error al buscar pagos:', error);
            return [];
        }
    }

    async addActivity(activity) {
        try {
            return await this.add('activities', {
                ...activity,
                timestamp: new Date().toISOString(),
                synced: false
            });
        } catch (error) {
            console.error('Error al agregar actividad:', error);
            return null;
        }
    }

    // Método para obtener todos los datos de un usuario
    async getUserData(userId) {
        try {
            const companies = await this.getCompaniesByUser(userId);
            const data = { companies: [] };
            
            for (const company of companies) {
                const contracts = await this.getContractsByCompany(company.id);
                const companyData = { ...company, contracts: [] };
                
                for (const contract of contracts) {
                    const certifications = await this.getCertificationsByContract(contract.id);
                    const invoices = await this.getAll('invoices', 'contractId', contract.id);
                    const contractData = { ...contract, certifications, invoices };
                    companyData.contracts.push(contractData);
                }
                
                data.companies.push(companyData);
            }
            
            return data;
        } catch (error) {
            console.error('Error al obtener datos del usuario:', error);
            return { companies: [] };
        }
    }

    // Método para limpiar datos de un usuario
    async clearUserData(userId) {
        try {
            const stores = ['companies', 'contracts', 'certifications', 'invoices', 'payments', 'activities'];
            
            for (const storeName of stores) {
                const items = await this.getAll(storeName, 'userId', userId);
                for (const item of items) {
                    await this.delete(storeName, item.id);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error al limpiar datos:', error);
            return false;
        }
    }
}

// Crear instancia global de la base de datos
const db = new Database();
