class SupabaseSyncService {
    constructor() {
        this.client = null;
        this.isConfigured = false;
        this.isSyncing = false;
        this.lastSyncAt = null;
        this.tableName = 'app_records';
        this.stores = ['users', 'companies', 'contracts', 'certifications', 'invoices', 'payments', 'activities'];
        this.init();
    }

    init() {
        const config = window.SUPABASE_CONFIG;
        const hasLibrary = !!window.supabase?.createClient;
        this.isConfigured = Boolean(config?.url && config?.anonKey && hasLibrary);

        if (!this.isConfigured) {
            console.warn('Supabase no configurado. Se utilizará solo almacenamiento local.');
            return;
        }

        this.client = window.supabase.createClient(config.url, config.anonKey);
    }

    canSync() {
        return this.isConfigured && this.client && navigator.onLine;
    }

    async fetchUserByEmail(email) {
        if (!this.canSync()) return null;

        const { data, error } = await this.client
            .from(this.tableName)
            .select('record_id, user_id, payload, updated_at, is_deleted')
            .eq('store_name', 'users')
            .eq('email', email)
            .eq('is_deleted', false)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error buscando usuario en Supabase:', error);
            return null;
        }

        return data?.payload || null;
    }

    async pushChange({ storeName, record, operation = 'upsert' }) {
        if (!this.canSync()) return;

        try {
            if (operation === 'delete') {
                const payload = {
                    store_name: storeName,
                    record_id: record.id,
                    user_id: record.userId ?? null,
                    email: storeName === 'users' ? record.email ?? null : null,
                    payload: record,
                    updated_at: new Date().toISOString(),
                    is_deleted: true
                };

                const { error } = await this.client.from(this.tableName).upsert(payload, { onConflict: 'store_name,record_id' });
                if (error) throw error;
                return;
            }

            const payload = {
                store_name: storeName,
                record_id: record.id,
                user_id: record.userId ?? (storeName === 'users' ? record.id : null),
                email: storeName === 'users' ? record.email ?? null : null,
                payload: record,
                updated_at: record.updatedAt || new Date().toISOString(),
                is_deleted: false
            };

            const { error } = await this.client.from(this.tableName).upsert(payload, { onConflict: 'store_name,record_id' });
            if (error) throw error;
        } catch (error) {
            console.error('Error sincronizando cambio con Supabase:', error);
        }
    }

    async downloadUserData(userId) {
        if (!this.canSync() || !userId) return;

        try {
            const { data, error } = await this.client
                .from(this.tableName)
                .select('store_name, record_id, user_id, payload, updated_at, is_deleted')
                .eq('user_id', userId)
                .in('store_name', this.stores);

            if (error) throw error;

            const records = data || [];
            for (const row of records) {
                if (!row?.store_name || !row?.record_id) continue;

                if (row.is_deleted) {
                    await db.deleteLocalOnly(row.store_name, row.record_id);
                    continue;
                }

                const localRecord = await db.get(row.store_name, row.record_id);
                const remoteUpdatedAt = row.updated_at ? Date.parse(row.updated_at) : 0;
                const localUpdatedAt = localRecord?.updatedAt ? Date.parse(localRecord.updatedAt) : 0;

                if (!localRecord || remoteUpdatedAt >= localUpdatedAt) {
                    await db.putWithId(row.store_name, row.payload || { id: row.record_id, userId });
                }
            }

            this.lastSyncAt = new Date().toISOString();
        } catch (error) {
            console.error('Error descargando datos desde Supabase:', error);
            throw error;
        }
    }

    async uploadUserData(userId) {
        if (!this.canSync() || !userId) return;

        try {
            for (const store of this.stores) {
                const records = await db.getAll(store, 'userId', userId);

                for (const record of records) {
                    await this.pushChange({ storeName: store, record, operation: 'upsert' });
                }
            }

            this.lastSyncAt = new Date().toISOString();
        } catch (error) {
            console.error('Error subiendo datos a Supabase:', error);
            throw error;
        }
    }

    async syncUserData(userId) {
        if (!this.canSync() || !userId || this.isSyncing) return;

        this.isSyncing = true;
        try {
            await this.uploadUserData(userId);
            await this.downloadUserData(userId);
            console.log('Sincronización con Supabase completada');
        } finally {
            this.isSyncing = false;
        }
    }
}

window.supabaseSync = new SupabaseSyncService();
