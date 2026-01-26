class Database {
    constructor() {
        this.dbName = 'ContractManagerDB';
        this.version = 2;
        this.db = null;
        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Tabla de usuarios
                if (!db.objectStoreNames.contains('users')) {
                    const usersStore = db.createObjectStore('users', { keyPath: 'id' });
                    usersStore.createIndex('email', 'email', { unique: true });
                }
                
                // Tabla de empresas
                if (!db.objectStoreNames.contains('companies')) {
                    const companiesStore = db.createObjectStore('companies', { keyPath: 'id' });
                    companiesStore.createIndex('userId', 'userId', { unique: false });
                }
                
                // Tabla de contratos
                if (!db.objectStoreNames.contains('contracts')) {
                    const contractsStore = db.createObjectStore('contracts', { keyPath: 'id' });
                    contractsStore.createIndex('companyId', 'companyId', { unique: false });
                    contractsStore.createIndex('userId', 'userId', { unique: false });
                }
                
                // Tabla de certificaciones
                if (!db.objectStoreNames.contains('certifications')) {
                    const certsStore = db.createObjectStore('certifications', { keyPath: 'id' });
                    certsStore.createIndex('contractId', 'contractId', { unique: false });
                    certsStore.createIndex('companyId', 'companyId', { unique: false });
                    certsStore.createIndex('userId', 'userId', { unique: false });
                }
                
                // Tabla de facturas
                if (!db.objectStoreNames.contains('invoices')) {
                    const invoicesStore = db.createObjectStore('invoices', { keyPath: 'id' });
                    invoicesStore.createIndex('contractId', 'contractId', { unique: false });
                    invoicesStore.createIndex('companyId', 'companyId', { unique: false });
                    invoicesStore.createIndex('userId', 'userId', { unique: false });
                }
                
                // Tabla de pagos
                if (!db.objectStoreNames.contains('payments')) {
                    const paymentsStore = db.createObjectStore('payments', { keyPath: 'id' });
                    paymentsStore.createIndex('certificationId', 'certificationId', { unique: false });
                    paymentsStore.createIndex('companyId', 'companyId', { unique: false });
                    paymentsStore.createIndex('userId', 'userId', { unique: false });
                }
                
                // Tabla de actividades
                if (!db.objectStoreNames.contains('activities')) {
                    const activitiesStore = db.createObjectStore('activities', { keyPath: 'id' });
                    activitiesStore.createIndex('companyId', 'companyId', { unique: false });
                    activitiesStore.createIndex('userId', 'userId', { unique: false });
                }
            };
        });
    }

    // Métodos genéricos
    add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add({ 
                ...data, 
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9) 
            });
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    update(storeName, id, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put({ ...data, id });
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    get(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    getAll(storeName, indexName = null, value = null) {
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
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    // Métodos específicos para la aplicación
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

    async addActivity(activity) {
        return await this.add('activities', {
            ...activity,
            timestamp: new Date().toISOString(),
            synced: false
        });
    }

    // Método para obtener todos los datos de un usuario
    async getUserData(userId) {
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
    }
}

// Crear instancia global de la base de datos
const db = new Database();
