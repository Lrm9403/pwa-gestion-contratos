// Inicialización de la aplicación
class ContractManagerApp {
    constructor() {
        this.init();
    }

    async init() {
        try {
            // Configurar navegación primero
            this.setupNavigation();
            
            // Configurar modal
            this.setupModal();
            
            // Configurar gestión de conexión
            this.setupConnectionManager();
            
            // Configurar formularios
            this.setupForms();
            
            // Esperar a que la base de datos esté lista
            await db.ready();
            console.log('Aplicación inicializada correctamente');
            
        } catch (error) {
            console.error('Error al inicializar la aplicación:', error);
            
            // Intentar limpiar la base de datos y recargar si hay error
            if (error.name === 'InvalidStateError' || error.name === 'AbortError') {
                console.log('Intentando limpiar base de datos...');
                try {
                    await db.clearDatabase();
                    console.log('Base de datos limpiada, recargando...');
                    setTimeout(() => location.reload(), 1000);
                } catch (clearError) {
                    console.error('Error al limpiar base de datos:', clearError);
                }
            }
            
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
            if (window.companies) {
                companies.selectCompany(e.target.value);
            }
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
        setTimeout(() => {
            if (sectionId === 'contracts' && window.contracts) {
                contracts.loadContracts();
            } else if (sectionId === 'certifications' && window.certifications) {
                certifications.loadCertifications();
            } else if (sectionId === 'payments' && window.payments) {
                payments.loadPayments();
            } else if (sectionId === 'salary' && window.salary) {
                salary.updateSalarySummary();
            } else if (sectionId === 'companies' && window.companies) {
                companies.loadCompanies();
            }
        }, 100);
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
        const updateConnectionStatus = () => {
            const isOnline = navigator.onLine;
            const connectionIcon = document.getElementById('connection-icon');
            const connectionStatus = document.getElementById('connection-status');
            
            if (connectionIcon && connectionStatus) {
                if (isOnline) {
                    connectionIcon.className = 'fas fa-wifi';
                    connectionStatus.textContent = 'En línea';
                    connectionStatus.style.color = 'var(--success-color)';
                } else {
                    connectionIcon.className = 'fas fa-wifi-slash';
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

    showMessage(message, type) {
        if (window.auth && auth.showMessage) {
            auth.showMessage(message, type);
        } else {
            alert(message);
        }
    }
}

// Registrar Service Worker solo si está disponible
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('ServiceWorker registrado:', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker no registrado:', error);
            });
    });
}

// Inicializar aplicación
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ContractManagerApp();
    window.app = app;
});
