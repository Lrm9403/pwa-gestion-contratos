// Inicialización de la aplicación
class ContractManagerApp {
    constructor() {
        this.init();
    }

    async init() {
        // Esperar a que la base de datos se inicialice
        await db.init;
        
        // Configurar navegación
        this.setupNavigation();
        
        // Configurar modal
        this.setupModal();
        
        // Configurar gestión de conexión
        this.setupConnectionManager();
        
        // Cargar empresas del usuario
        this.loadUserCompanies();
        
        // Inicializar Select2
        this.initSelect2();
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
    }

    setupModal() {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const modalClose = document.getElementById('modal-close');
        const modalCancel = document.getElementById('modal-cancel');
        
        let currentOnSave = null;
        
        window.modal = {
            show: ({ title, body, onSave }) => {
                modalTitle.textContent = title;
                modalBody.innerHTML = body;
                currentOnSave = onSave;
                modal.classList.add('active');
            },
            
            hide: () => {
                modal.classList.remove('active');
                modalBody.innerHTML = '';
                currentOnSave = null;
            }
        };
        
        modalClose.addEventListener('click', () => window.modal.hide());
        modalCancel.addEventListener('click', () => window.modal.hide());
        
        document.getElementById('modal-save')?.addEventListener('click', () => {
            if (currentOnSave) {
                currentOnSave();
            }
        });
        
        // Cerrar modal al hacer clic fuera
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                window.modal.hide();
            }
        });
    }

    setupConnectionManager() {
        const connectionIcon = document.getElementById('connection-icon');
        const connectionStatus = document.getElementById('connection-status');
        
        const updateConnectionStatus = () => {
            const isOnline = navigator.onLine;
            
            if (isOnline) {
                connectionIcon.className = 'fas fa-wifi';
                connectionStatus.textContent = 'En línea';
                connectionStatus.style.color = 'var(--success-color)';
                
                // Intentar sincronizar datos pendientes
                this.syncPendingData();
            } else {
                connectionIcon.className = 'fas fa-wifi-slash';
                connectionStatus.textContent = 'Sin conexión';
                connectionStatus.style.color = 'var(--danger-color)';
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
            console.log('Sincronizando datos...');
            
            // Por ahora, solo marcamos las actividades como sincronizadas
            const activities = await db.getAll('activities');
            const pendingActivities = activities.filter(a => !a.synced);
            
            for (const activity of pendingActivities) {
                await db.update('activities', activity.id, {
                    ...activity,
                    synced: true
                });
            }
            
        } catch (error) {
            console.error('Error al sincronizar datos:', error);
        }
    }

    async loadUserCompanies() {
        if (!auth.currentUser) return;
        
        try {
            const companies = await db.getCompaniesByUser(auth.currentUser.id);
            
            // Guardar en localStorage para acceso rápido
            localStorage.setItem('userCompanies', JSON.stringify(companies));
            
            // Actualizar selector
            this.updateCompanySelector(companies);
            
            // Mostrar lista de empresas
            this.renderCompaniesList(companies);
            
        } catch (error) {
            console.error('Error al cargar empresas:', error);
        }
    }

    updateCompanySelector(companies) {
        const select = document.getElementById('company-select');
        select.innerHTML = '';
        
        companies.forEach(company => {
            const option = document.createElement('option');
            option.value = company.id;
            option.textContent = company.name;
            select.appendChild(option);
        });
        
        // Si hay empresas, seleccionar la primera
        if (companies.length > 0 && !contracts.currentCompany) {
            contracts.currentCompany = companies[0];
            localStorage.setItem('currentCompany', JSON.stringify(companies[0]));
            contracts.updateCompanyUI();
            contracts.loadContracts();
            certifications.loadCertifications();
            salary.updateSalarySummary();
        }
    }

    renderCompaniesList(companies) {
        const container = document.getElementById('companies-list');
        container.innerHTML = '';
        
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
        const companies = JSON.parse(localStorage.getItem('userCompanies') || '[]');
        contracts.currentCompany = companies.find(c => c.id === companyId);
        
        if (contracts.currentCompany) {
            localStorage.setItem('currentCompany', JSON.stringify(contracts.currentCompany));
            contracts.updateCompanyUI();
            contracts.loadContracts();
            certifications.loadCertifications();
            salary.updateSalarySummary();
            this.showSection('dashboard');
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
                <input type="text" id="company-address" value="${company?.address || ''}">
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
        const company = {
            name: document.getElementById('company-name').value,
            taxId: document.getElementById('company-taxId').value,
            address: document.getElementById('company-address').value,
            phone: document.getElementById('company-phone').value,
            email: document.getElementById('company-email').value,
            userId: auth.currentUser.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (!company.name) {
            auth.showMessage('El nombre de la empresa es requerido', 'error');
            return;
        }
        
        try {
            if (id) {
                await db.update('companies', id, company);
                auth.showMessage('Empresa actualizada exitosamente', 'success');
            } else {
                await db.add('companies', company);
                auth.showMessage('Empresa creada exitosamente', 'success');
            }
            
            modal.hide();
            this.loadUserCompanies();
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: id || company.id,
                type: id ? 'company_update' : 'company_create',
                description: `${id ? 'Actualizada' : 'Creada'} empresa ${company.name}`
            });
            
        } catch (error) {
            auth.showMessage('Error al guardar la empresa', 'error');
            console.error(error);
        }
    }

    async editCompany(id) {
        try {
            const company = await db.get('companies', id);
            if (company) {
                this.showCompanyForm(company);
            }
        } catch (error) {
            console.error('Error al cargar empresa:', error);
        }
    }

    initSelect2() {
        // Inicializar Select2 en todos los select
        setTimeout(() => {
            $('select').select2({
                width: '100%',
                dropdownParent: $('#modal')
            });
        }, 100);
    }
}

// Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registrado exitosamente:', registration.scope);
            })
            .catch(error => {
                console.log('Error al registrar ServiceWorker:', error);
            });
    });
}

// Inicializar aplicación
const app = new ContractManagerApp();
