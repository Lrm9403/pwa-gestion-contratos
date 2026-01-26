class Database {
    constructor() {
        this.dbName = 'ContractManagerDB';
        this.version = 4; // Incrementado a 4
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
                
                // Verificar que los object stores existen
                setTimeout(() => this.verifyObjectStores(), 100);
                
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                console.log("Actualizando base de datos a versión:", this.version);
                const db = event.target.result;
                
                // Crear o actualizar object stores
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

    async verifyObjectStores() {
        if (!this.db) return;
        
        const stores = ['users', 'companies', 'contracts', 'certifications', 'invoices', 'payments', 'activities'];
        const missingStores = [];
        
        for (const store of stores) {
            if (!this.db.objectStoreNames.contains(store)) {
                missingStores.push(store);
            }
        }
        
        if (missingStores.length > 0) {
            console.warn('Object stores faltantes:', missingStores);
            // Forzar recreación de la base de datos
            indexedDB.deleteDatabase(this.dbName);
            location.reload();
        }
    }

    createObjectStore(db, name, keyPath, indexes = []) {
        let store;
        if (!db.objectStoreNames.contains(name)) {
            store = db.createObjectStore(name, { keyPath: keyPath, autoIncrement: false });
        } else {
            const transaction = db.transaction([name], 'readwrite');
            store = transaction.objectStore(name);
        }
        
        // Crear índices
        indexes.forEach(index => {
            if (store.indexNames && !store.indexNames.contains(index)) {
                try {
                    store.createIndex(index, index, { unique: false });
                } catch (e) {
                    console.warn(`No se pudo crear índice ${index} en ${name}:`, e);
                }
            }
        });
    }

    async ready() {
        return this.initPromise;
    }

    // Métodos genéricos mejorados
    async add(storeName, data) {
        await this.ready();
        
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Base de datos no inicializada"));
                return;
            }

            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                // Generar ID único
                const id = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                const item = { ...data, id };
                
                const request = store.add(item);
                
                request.onerror = (event) => {
                    console.error(`Error al añadir a ${storeName}:`, event.target.error);
                    reject(event.target.error);
                };
                
                request.onsuccess = () => {
                    console.log(`Elemento añadido a ${storeName}:`, id);
                    resolve(id);
                };
                
                transaction.onerror = (event) => {
                    console.error(`Error en transacción de ${storeName}:`, event.target.error);
                    reject(event.target.error);
                };
                
            } catch (error) {
                console.error(`Error en add para ${storeName}:`, error);
                reject(error);
            }
        });
    }

    async update(storeName, id, data) {
        await this.ready();
        
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Base de datos no inicializada"));
                return;
            }

            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put({ ...data, id });
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                
            } catch (error) {
                console.error(`Error en update para ${storeName}:`, error);
                reject(error);
            }
        });
    }

    async delete(storeName, id) {
        await this.ready();
        
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Base de datos no inicializada"));
                return;
            }

            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(id);
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                
            } catch (error) {
                console.error(`Error en delete para ${storeName}:`, error);
                reject(error);
            }
        });
    }

    async get(storeName, id) {
        await this.ready();
        
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Base de datos no inicializada"));
                return;
            }

            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                
            } catch (error) {
                console.error(`Error en get para ${storeName}:`, error);
                reject(error);
            }
        });
    }

    async getAll(storeName, indexName = null, value = null) {
        await this.ready();
        
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Base de datos no inicializada"));
                return;
            }

            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                
                let request;
                if (indexName && value !== null && value !== undefined) {
                    const index = store.index(indexName);
                    request = index.getAll(value);
                } else {
                    request = store.getAll();
                }
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result || []);
                
            } catch (error) {
                console.error(`Error en getAll para ${storeName}:`, error);
                reject(error);
            }
        });
    }

    // Métodos específicos mejorados
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

    async getPaymentsByContract(contractId) {
        try {
            return await this.getAll('payments', 'contractId', contractId);
        } catch (error) {
            console.error('Error al buscar pagos por contrato:', error);
            return [];
        }
    }

    async getPaymentsByCertification(certificationId) {
        try {
            return await this.getAll('payments', 'certificationId', certificationId);
        } catch (error) {
            console.error('Error al buscar pagos por certificación:', error);
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

    // Método para exportar todos los datos
    async exportAllData(userId) {
        try {
            const data = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                user: await this.get('users', userId),
                companies: await this.getCompaniesByUser(userId)
            };
            
            // Para cada empresa, obtener sus datos
            for (const company of data.companies) {
                company.contracts = await this.getContractsByCompany(company.id);
                
                // Para cada contrato, obtener certificaciones y pagos
                for (const contract of company.contracts) {
                    contract.certifications = await this.getCertificationsByContract(contract.id);
                    contract.payments = await this.getPaymentsByContract(contract.id);
                }
            }
            
            return data;
        } catch (error) {
            console.error('Error al exportar datos:', error);
            return null;
        }
    }
}

// Crear instancia global de la base de datos
const db = new Database();
window.db = db; // Hacer disponible globalmente para depuración
