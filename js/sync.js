class SyncManager {
    constructor(db) {
        this.db = db;
        this.syncInterval = null;
        this.isSyncing = false;
    }
    
    startAutoSync(interval = 5 * 60 * 1000) { // 5 minutos por defecto
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        this.syncInterval = setInterval(() => {
            if (navigator.onLine && !this.isSyncing) {
                this.sync();
            }
        }, interval);
    }
    
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
    
    async sync() {
        if (this.isSyncing || !navigator.onLine) {
            return false;
        }
        
        this.isSyncing = true;
        
        try {
            // Obtener elementos pendientes de sincronización
            const pendingItems = await this.db.syncQueue.where('status').equals('pending').toArray();
            
            if (pendingItems.length === 0) {
                this.isSyncing = false;
                return true;
            }
            
            // Aquí iría la lógica para enviar datos al servidor
            // Por ahora, simulamos una sincronización exitosa
            
            for (const item of pendingItems) {
                // Marcar como completado
                await this.db.syncQueue.update(item.id, {
                    status: 'completed',
                    lastAttempt: new Date().toISOString()
                });
            }
            
            console.log(`Sincronizados ${pendingItems.length} items`);
            this.isSyncing = false;
            return true;
            
        } catch (error) {
            console.error('Error en sincronización:', error);
            this.isSyncing = false;
            return false;
        }
    }
    
    async addToQueue(type, data) {
        return addToSyncQueue(this.db, type, data);
    }
    
    async getQueueStatus() {
        const pending = await this.db.syncQueue.where('status').equals('pending').toArray();
        const completed = await this.db.syncQueue.where('status').equals('completed').toArray();
        const failed = await this.db.syncQueue.where('status').equals('failed').toArray();
        
        return {
            pending: pending.length,
            completed: completed.length,
            failed: failed.length,
            total: pending.length + completed.length + failed.length
        };
    }
}
