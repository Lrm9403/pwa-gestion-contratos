// Inicialización de la aplicación
class ContractManagerApp {
    constructor() {
        this.initPromise = this.init();
    }

    async init() {
        try {
            // Esperar a que la base de datos se inicialice
            await db.ready();
            console.log('Base de datos lista');
            
            // Configurar navegación
            this.setupNavigation();
            
            // Configurar modal
            this.setupModal();
            
            // Configurar gestión de conexión
            this.setupConnectionManager();
            
            // Configurar formularios
            this.setupForms();
            
        } catch (error) {
            console.error('Error al inicializar la aplicación:', error);
            this.showMessage('Error al inicializar la aplicación. Recarga la página.', 'error');
        }
    }

    setupNavigation() {
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                this.showSection(section);
                
                // Actualizar clase activa
                menuItems.forEach(i => i.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });
        
        // Menú toggle para móviles
        document.getElementById('menu-toggle')?.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('active');
        });
        
        // Seleccionar empresa
        document.getElementById('company-select')?.addEventListener('change', (e) => {
            this.selectCompany(e.target.value);
        });
    }

    showSection(sectionId) {
        // Ocultar todas las secciones
        const sections = document.querySelectorAll('.content-section');
        sections.forEach(section => section.classList.remove('active'));
        
        // Mostrar sección seleccionada
        const targetSection = document.getElementById(`${sectionId}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
        }
        
        // Cargar datos si es necesario
        if (sectionId === 'contracts' && window.contracts) {
            contracts.loadContracts();
        } else if (sectionId === 'certifications' && window.certifications) {
            certifications.loadCertifications();
        } else if (sectionId === 'payments' && window.payments) {
            payments.loadPayments();
        } else if (sectionId === 'salary' && window.salary) {
            salary.updateSalarySummary();
        } else if (sectionId === 'companies') {
            this.loadCompanies();
        }
    }

    setupModal() {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const modalClose = document.getElementById('modal-close');
        const modalCancel = document.getElementById('modal-cancel');
        const modalSave = document.getElementById('modal-save');
        
        let currentOnSave = null;
        
        window.modal = {
            show: ({ title, body, onSave }) => {
                modalTitle.textContent = title;
                modalBody.innerHTML = body;
                currentOnSave = onSave;
                modal.classList.add('active');
                
                // Inicializar Select2 en los select del modal
                setTimeout(() => {
                    if (window.$) {
                        $('#modal select').select2({
                            width: '100%',
                            dropdownParent: $('#modal')
                        });
                    }
                }, 100);
            },
            
            hide: () => {
                modal.classList.remove('active');
                modalBody.innerHTML = '';
                currentOnSave = null;
            }
        };
        
        if (modalClose) modalClose.addEventListener('click', () => window.modal.hide());
        if (modalCancel) modalCancel.addEventListener('click', () => window.modal.hide());
        
        if (modalSave) {
            modalSave.addEventListener('click', () => {
                if (currentOnSave) {
                    currentOnSave();
                }
            });
        }
        
        // Cerrar modal al hacer clic fuera
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    window.modal.hide();
                }
            });
        }
    }

    setupConnectionManager() {
        const connectionIcon = document.getElementById('connection-icon');
        const connectionStatus = document.getElementById('connection-status');
        
        const updateConnectionStatus = () => {
            const isOnline = navigator.onLine;
            
            if (isOnline) {
                if (connectionIcon) connectionIcon.className = 'fas fa-wifi';
                if (connectionStatus) {
                    connectionStatus.textContent = 'En línea';
                    connectionStatus.style.color = 'var(--success-color)';
                }
                
                // Intentar sincronizar datos pendientes
                this.syncPendingData();
            } else {
                if (connectionIcon) connectionIcon.className = 'fas fa-wifi-slash';
                if (connectionStatus) {
                    connectionStatus.textContent = 'Sin conexión';
                    connectionStatus.style.color = 'var(--danger-color)';
                }
            }
        };
        
        // Estado inicial
        updateConnectionStatus();
        
        // Escuchar cambios en la conexión
        window.addEventListener('online', updateConnectionStatus);
        window.addEventListener('offline', updateConnectionStatus);
    }

    async syncPendingData() {
        try {
            // En una implementación real, aquí se sincronizarían los datos
            // con un servidor backend
            console.log('Sincronizando datos pendientes...');
            
            // Por ahora, solo marcamos las actividades como sincronizadas
            const activities = await db.getAll('activities');
            const pendingActivities = activities.filter(a => !a.synced);
            
            for (const activity of pendingActivities) {
                await db.update('activities', activity.id, {
                    ...activity,
                    synced: true
                });
            }
            
            console.log('Datos sincronizados');
            
        } catch (error) {
            console.error('Error al sincronizar datos:', error);
        }
    }

    setupForms() {
        // Prevenir envío de formularios por defecto
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (window.auth) auth.login();
            });
        }
        
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (window.auth) auth.register();
            });
        }
    }

    async loadCompanies() {
        if (!auth.currentUser) return;
        
        try {
            const companies = await db.getCompaniesByUser(auth.currentUser.id);
            localStorage.setItem('userCompanies', JSON.stringify(companies));
            this.renderCompaniesList(companies);
            this.updateCompanySelector(companies);
        } catch (error) {
            console.error('Error al cargar empresas:', error);
        }
    }

    updateCompanySelector(companies) {
        const select = document.getElementById('company-select');
        if (!select) return;
        
        select.innerHTML = '<option value="">Seleccionar empresa</option>';
        
        companies.forEach(company => {
            const option = document.createElement('option');
            option.value = company.id;
            option.textContent = company.name;
            select.appendChild(option);
        });
        
        // Seleccionar empresa actual si existe
        const currentCompany = localStorage.getItem('currentCompany');
        if (currentCompany) {
            try {
                const parsed = JSON.parse(currentCompany);
                select.value = parsed.id;
            } catch (e) {
                console.error('Error al parsear empresa actual:', e);
            }
        }
    }

    renderCompaniesList(companies) {
        const container = document.getElementById('companies-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (companies.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    <i class="fas fa-building" style="font-size: 3rem; color: #ccc; margin-bottom: 20px;"></i>
                    <h3>No hay empresas registradas</h3>
                    <p>Haz clic en "Nueva Empresa" para agregar una</p>
                </div>
            `;
            return;
        }
        
        companies.forEach(company => {
            const card = document.createElement('div');
            card.className = 'company-card';
            card.innerHTML = `
                <h3>${company.name}</h3>
                <p><strong>RUC/RIF:</strong> ${company.taxId || 'No especificado'}</p>
                <p><strong>Dirección:</strong> ${company.address || 'No especificada'}</p>
                <p><strong>Teléfono:</strong> ${company.phone || 'No especificado'}</p>
                <p><strong>Email:</strong> ${company.email || 'No especificado'}</p>
                <div class="company-actions">
                    <button class="btn btn-sm btn-primary" onclick="app.selectCompany('${company.id}')">
                        Seleccionar
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="app.editCompany('${company.id}')">
                        Editar
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
        
        // Configurar botón para agregar empresa
        document.getElementById('add-company')?.addEventListener('click', () => this.showCompanyForm());
    }

    async selectCompany(companyId) {
        try {
            const company = await db.get('companies', companyId);
            if (company) {
                // Actualizar en localStorage
                localStorage.setItem('currentCompany', JSON.stringify(company));
                
                // Actualizar en módulos
                if (window.contracts) {
                    contracts.currentCompany = company;
                    contracts.updateCompanyUI();
                    contracts.loadContracts();
                }
                
                if (window.certifications) certifications.loadCertifications();
                if (window.payments) payments.loadPayments();
                if (window.salary) salary.updateSalarySummary();
                
                // Actualizar selector
                const select = document.getElementById('company-select');
                if (select) select.value = companyId;
                
                // Mostrar dashboard
                this.showSection('dashboard');
            }
        } catch (error) {
            console.error('Error al seleccionar empresa:', error);
            this.showMessage('Error al seleccionar empresa', 'error');
        }
    }

    showCompanyForm(company = null) {
        const title = company ? 'Editar Empresa' : 'Nueva Empresa';
        const form = `
            <div class="form-group">
                <label for="company-name">Nombre:</label>
                <input type="text" id="company-name" value="${company?.name || ''}" required>
            </div>
            <div class="form-group">
                <label for="company-taxId">RUC/RIF:</label>
                <input type="text" id="company-taxId" value="${company?.taxId || ''}">
            </div>
            <div class="form-group">
                <label for="company-address">Dirección:</label>
                <textarea id="company-address" rows="2">${company?.address || ''}</textarea>
            </div>
            <div class="form-group">
                <label for="company-phone">Teléfono:</label>
                <input type="tel" id="company-phone" value="${company?.phone || ''}">
            </div>
            <div class="form-group">
                <label for="company-email">Email:</label>
                <input type="email" id="company-email" value="${company?.email || ''}">
            </div>
        `;
        
        modal.show({
            title: title,
            body: form,
            onSave: () => this.saveCompany(company?.id)
        });
    }

    async saveCompany(id = null) {
        const name = document.getElementById('company-name').value.trim();
        const taxId = document.getElementById('company-taxId').value.trim();
        const address = document.getElementById('company-address').value.trim();
        const phone = document.getElementById('company-phone').value.trim();
        const email = document.getElementById('company-email').value.trim();
        
        if (!name) {
            this.showMessage('El nombre de la empresa es requerido', 'error');
            return;
        }
        
        const company = {
            name,
            taxId,
            address,
            phone,
            email,
            userId: auth.currentUser.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        try {
            if (id) {
                const existing = await db.get('companies', id);
                if (existing) {
                    company.createdAt = existing.createdAt;
                    await db.update('companies', id, company);
                    this.showMessage('Empresa actualizada exitosamente', 'success');
                }
            } else {
                await db.add('companies', company);
                this.showMessage('Empresa creada exitosamente', 'success');
            }
            
            modal.hide();
            await this.loadCompanies();
            
            // Si es la primera empresa, seleccionarla automáticamente
            if (!id && !localStorage.getItem('currentCompany')) {
                const companies = await db.getCompaniesByUser(auth.currentUser.id);
                const newCompany = companies.find(c => c.name === name);
                if (newCompany) {
                    this.selectCompany(newCompany.id);
                }
            }
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: id || company.id,
                type: id ? 'company_update' : 'company_create',
                description: `${id ? 'Actualizada' : 'Creada'} empresa ${name}`
            });
            
        } catch (error) {
            console.error('Error al guardar empresa:', error);
            this.showMessage('Error al guardar la empresa: ' + error.message, 'error');
        }
    }

    async editCompany(id) {
        try {
            const company = await db.get('companies', id);
            if (company) {
                this.showCompanyForm(company);
            } else {
                this.showMessage('Empresa no encontrada', 'error');
            }
        } catch (error) {
            console.error('Error al cargar empresa:', error);
            this.showMessage('Error al cargar la empresa', 'error');
        }
    }

    showMessage(message, type) {
        if (window.auth && auth.showMessage) {
            auth.showMessage(message, type);
        } else {
            alert(message);
        }
    }
}

// Registrar Service Worker
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registrado exitosamente:', registration.scope);
            })
            .catch(error => {
                console.log('Error al registrar ServiceWorker:', error);
            });
    });
} else {
    console.log('ServiceWorker no soportado o no en HTTPS');
}

// Inicializar aplicación
let app;
document.addEventListener('DOMContentLoaded', async () => {
    try {
        app = new ContractManagerApp();
        window.app = app;
        await app.initPromise;
    } catch (error) {
        console.error('Error al inicializar aplicación:', error);
    }
});
