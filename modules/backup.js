class BackupManager {
    constructor() {
        this.init();
    }

    init() {
        document.getElementById('backup-export')?.addEventListener('click', () => this.exportBackup());
        document.getElementById('backup-import')?.addEventListener('click', () => this.importBackup());
    }

    async exportBackup() {
        if (!auth.currentUser) {
            auth.showMessage('Primero inicia sesión', 'error');
            return;
        }

        try {
            // Obtener todos los datos del usuario
            const userData = await db.getUserData(auth.currentUser.id);
            
            // Agregar metadatos
            const backupData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                user: {
                    id: auth.currentUser.id,
                    name: auth.currentUser.name,
                    email: auth.currentUser.email
                },
                data: userData
            };
            
            // Convertir a JSON
            const jsonData = JSON.stringify(backupData, null, 2);
            
            // Crear blob y descargar
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_${auth.currentUser.name}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            auth.showMessage('Copia de seguridad creada exitosamente', 'success');
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: null,
                type: 'backup_export',
                description: 'Exportada copia de seguridad'
            });
            
        } catch (error) {
            console.error('Error al crear copia de seguridad:', error);
            auth.showMessage('Error al crear copia de seguridad', 'error');
        }
    }

    async importBackup() {
        if (!auth.currentUser) {
            auth.showMessage('Primero inicia sesión', 'error');
            return;
        }

        if (!confirm('¿Estás seguro de importar datos? Esto sobrescribirá los datos existentes.')) {
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            
            reader.onload = async (event) => {
                try {
                    const backupData = JSON.parse(event.target.result);
                    
                    // Validar estructura
                    if (!backupData.version || !backupData.data || !backupData.user) {
                        throw new Error('Formato de archivo inválido');
                    }
                    
                    // Importar datos
                    await this.importData(backupData.data);
                    
                    auth.showMessage('Datos importados exitosamente', 'success');
                    
                    // Recargar la aplicación
                    window.location.reload();
                    
                } catch (error) {
                    console.error('Error al importar datos:', error);
                    auth.showMessage('Error al importar datos: ' + error.message, 'error');
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    }

    async importData(data) {
        // Limpiar datos existentes del usuario
        await this.clearUserData(auth.currentUser.id);
        
        // Importar empresas
        if (data.companies && Array.isArray(data.companies)) {
            for (const company of data.companies) {
                const { contracts, ...companyData } = company;
                companyData.userId = auth.currentUser.id;
                const companyId = await db.add('companies', companyData);
                
                // Importar contratos
                if (contracts && Array.isArray(contracts)) {
                    for (const contract of contracts) {
                        const { certifications, invoices, ...contractData } = contract;
                        contractData.companyId = companyId;
                        contractData.userId = auth.currentUser.id;
                        const contractId = await db.add('contracts', contractData);
                        
                        // Importar certificaciones
                        if (certifications && Array.isArray(certifications)) {
                            for (const cert of certifications) {
                                cert.contractId = contractId;
                                cert.companyId = companyId;
                                cert.userId = auth.currentUser.id;
                                await db.add('certifications', cert);
                            }
                        }
                        
                        // Importar facturas
                        if (invoices && Array.isArray(invoices)) {
                            for (const invoice of invoices) {
                                invoice.contractId = contractId;
                                invoice.companyId = companyId;
                                invoice.userId = auth.currentUser.id;
                                await db.add('invoices', invoice);
                            }
                        }
                    }
                }
            }
        }
    }

    async clearUserData(userId) {
        // Eliminar todos los datos asociados al usuario
        const stores = ['companies', 'contracts', 'certifications', 'invoices', 'payments', 'activities'];
        
        for (const storeName of stores) {
            const items = await db.getAll(storeName, 'userId', userId);
            for (const item of items) {
                await db.delete(storeName, item.id);
            }
        }
    }
}

const backupManager = new BackupManager();
