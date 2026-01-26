// Configuración de IndexedDB
const DB_NAME = 'gestionContratosDB';
const DB_VERSION = 1;

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            reject('Error al abrir la base de datos: ' + event.target.error);
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            resolve({
                companies: createStoreAccessor(db, 'companies'),
                contracts: createStoreAccessor(db, 'contracts'),
                certifications: createStoreAccessor(db, 'certifications'),
                payments: createStoreAccessor(db, 'payments'),
                invoices: createStoreAccessor(db, 'invoices'),
                syncQueue: createStoreAccessor(db, 'syncQueue')
            });
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Crear store de empresas
            if (!db.objectStoreNames.contains('companies')) {
                const companyStore = db.createObjectStore('companies', { keyPath: 'id', autoIncrement: true });
                companyStore.createIndex('name', 'name', { unique: true });
            }

            // Crear store de contratos
            if (!db.objectStoreNames.contains('contracts')) {
                const contractStore = db.createObjectStore('contracts', { keyPath: 'id', autoIncrement: true });
                contractStore.createIndex('companyId', 'companyId');
                contractStore.createIndex('codigo', 'codigo', { unique: true });
            }

            // Crear store de certificaciones
            if (!db.objectStoreNames.contains('certifications')) {
                const certStore = db.createObjectStore('certificaciones', { keyPath: 'id', autoIncrement: true });
                certStore.createIndex('companyId', 'companyId');
                certStore.createIndex('contractId', 'contractId');
                certStore.createIndex('mes_anio', ['mes', 'anio']);
            }

            // Crear store de pagos
            if (!db.objectStoreNames.contains('payments')) {
                const paymentStore = db.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
                paymentStore.createIndex('companyId', 'companyId');
                paymentStore.createIndex('certificationId', 'certificationId');
                paymentStore.createIndex('fecha', 'fecha');
            }

            // Crear store de facturas
            if (!db.objectStoreNames.contains('invoices')) {
                const invoiceStore = db.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
                invoiceStore.createIndex('companyId', 'companyId');
                invoiceStore.createIndex('contractId', 'contractId');
            }

            // Crear store para cola de sincronización
            if (!db.objectStoreNames.contains('syncQueue')) {
                const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                syncStore.createIndex('type', 'type');
                syncStore.createIndex('status', 'status');
            }
        };
    });
}

function createStoreAccessor(db, storeName) {
    return {
        add: (item) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.add(item);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },
        
        put: (item) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(item);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },
        
        get: (id) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },
        
        getAll: () => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },
        
        where: (indexName) => {
            return {
                equals: (value) => {
                    return new Promise((resolve, reject) => {
                        const transaction = db.transaction([storeName], 'readonly');
                        const store = transaction.objectStore(storeName);
                        const index = store.index(indexName);
                        const request = index.getAll(value);
                        
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                }
            };
        },
        
        delete: (id) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(id);
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },
        
        clear: () => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },
        
        update: (id, changes) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const getRequest = store.get(id);
                
                getRequest.onsuccess = () => {
                    const item = getRequest.result;
                    if (item) {
                        const updatedItem = { ...item, ...changes };
                        const putRequest = store.put(updatedItem);
                        putRequest.onsuccess = () => resolve(updatedItem);
                        putRequest.onerror = () => reject(putRequest.error);
                    } else {
                        reject(new Error('Item no encontrado'));
                    }
                };
                
                getRequest.onerror = () => reject(getRequest.error);
            });
        }
    };
}

// Función para agregar a la cola de sincronización
async function addToSyncQueue(db, type, data) {
    const syncItem = {
        type,
        data,
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
        lastAttempt: null
    };
    
    await db.syncQueue.add(syncItem);
}

// Función para procesar la cola de sincronización
async function processSyncQueue(db) {
    const pendingItems = await db.syncQueue.where('status').equals('pending');
    
    for (const item of pendingItems) {
        try {
            // Aquí iría la lógica para sincronizar con el servidor
            // Por ahora, solo marcamos como completado
            await db.syncQueue.update(item.id, {
                status: 'completed',
                lastAttempt: new Date().toISOString()
            });
        } catch (error) {
            await db.syncQueue.update(item.id, {
                attempts: item.attempts + 1,
                lastAttempt: new Date().toISOString(),
                status: item.attempts >= 3 ? 'failed' : 'pending'
            });
        }
    }
}
