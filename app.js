window.contractAppUtils = {
    toNumber(value) {
        const number = Number.parseFloat(value);
        return Number.isFinite(number) ? number : 0;
    },

    normalizeDecimal(value, decimals = 4) {
        const factor = 10 ** decimals;
        return Math.round((this.toNumber(value) + Number.EPSILON) * factor) / factor;
    },

    roundMoney(value) {
        return this.normalizeDecimal(value, 2);
    },

    parsePercentageInput(rawValue) {
        const raw = String(rawValue ?? '').trim().replace(',', '.');
        return {
            raw: raw === '' ? '0' : raw,
            value: this.toNumber(raw)
        };
    },

    formatPercentage(value, raw = null) {
        if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
            return `${String(raw).trim()}%`;
        }
        return `${this.normalizeDecimal(value, 2).toFixed(2)}%`;
    },

    formatCurrency(value) {
        return `$${this.roundMoney(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    getCompanyTaxPercentage(company) {
        if (!company) return 0;
        if (company.taxPercentageRaw !== undefined && company.taxPercentageRaw !== null && String(company.taxPercentageRaw).trim() !== '') {
            return this.toNumber(String(company.taxPercentageRaw).replace(',', '.'));
        }
        return this.toNumber(company.taxPercentage ?? 0);
    },

    calculateTaxAmount(baseAmount, taxPercentage) {
        return this.roundMoney(this.toNumber(baseAmount) * (this.toNumber(taxPercentage) / 100));
    },

    calculateTotalWithTax(baseAmount, taxPercentage) {
        return this.roundMoney(this.toNumber(baseAmount) + this.calculateTaxAmount(baseAmount, taxPercentage));
    },

    calculateSalaryAmount(baseAmount, salaryPercentage) {
        return this.roundMoney(this.toNumber(baseAmount) * (this.toNumber(salaryPercentage) / 100));
    },

    getCertificationPeriodLabel(certification) {
        return `${String(certification.month).padStart(2, '0')}/${certification.year}`;
    },

    comparePeriods(a, b) {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
    }
};

// Inicialización de la aplicación
class ContractManagerApp {
    constructor() {
        this.init();
    }

    async init() {
        try {
            this.setupNavigation();
            this.setupModal();
            this.setupConnectionManager();
            this.setupForms();

            await db.ready();
            console.log('Aplicación inicializada correctamente');
        } catch (error) {
            console.error('Error al inicializar la aplicación:', error);

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
                menuItems.forEach(i => i.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });

        document.getElementById('menu-toggle')?.addEventListener('click', () => {
            document.querySelector('.sidebar')?.classList.toggle('active');
        });

        document.getElementById('company-select')?.addEventListener('change', (e) => {
            if (window.companies) {
                companies.selectCompany(e.target.value);
            }
        });
    }

    showSection(sectionId) {
        const sections = document.querySelectorAll('.content-section');
        sections.forEach(section => section.classList.remove('active'));

        const section = document.getElementById(`${sectionId}-section`);
        if (section) {
            section.classList.add('active');
        }

        if (!window.auth?.currentUser || sectionId === 'companies') return;

        switch (sectionId) {
            case 'dashboard':
                dashboard.loadDashboardData();
                break;
            case 'contracts':
                contracts.loadContracts();
                break;
            case 'certifications':
                certifications.loadCertifications();
                break;
            case 'invoices':
                invoices.loadInvoices();
                break;
            case 'salary':
                salary.updateSalarySummary();
                break;
            case 'payments':
                payments.loadPayments();
                break;
            case 'tools':
                exportManager?.init?.();
                break;
        }
    }

    setupModal() {
        const modalElement = document.getElementById('modal');
        const closeButton = document.querySelector('.close');
        const cancelButton = document.getElementById('modal-cancel');
        const saveButton = document.getElementById('modal-save');

        closeButton?.addEventListener('click', () => modal.hide());
        cancelButton?.addEventListener('click', () => modal.hide());
        saveButton?.addEventListener('click', () => modal.save());

        window.addEventListener('click', (event) => {
            if (event.target === modalElement) {
                modal.hide();
            }
        });
    }

    setupConnectionManager() {
        window.addEventListener('online', () => this.updateConnectionStatus(true));
        window.addEventListener('offline', () => this.updateConnectionStatus(false));

        this.updateConnectionStatus(navigator.onLine);
    }

    updateConnectionStatus(isOnline) {
        const statusElement = document.getElementById('connection-status');
        const iconElement = document.getElementById('connection-icon');

        if (!statusElement || !iconElement) return;

        if (isOnline) {
            statusElement.textContent = 'En línea';
            iconElement.className = 'fas fa-wifi';
            iconElement.style.color = '#4CAF50';
        } else {
            statusElement.textContent = 'Sin conexión';
            iconElement.className = 'fas fa-wifi-slash';
            iconElement.style.color = '#f44336';
        }
    }

    setupForms() {
        document.getElementById('search-contracts')?.addEventListener('input', (e) => {
            contracts.filterContracts(e.target.value);
        });

        document.getElementById('filter-status')?.addEventListener('change', (e) => {
            certifications.filterByStatus(e.target.value);
        });
    }

    showMessage(message, type = 'info') {
        const messageContainer = document.getElementById('message-container');
        if (!messageContainer) {
            alert(message);
            return;
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message message-${type}`;
        messageElement.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">&times;</button>
        `;

        messageContainer.appendChild(messageElement);

        setTimeout(() => {
            if (messageElement.parentElement) {
                messageElement.remove();
            }
        }, 5000);
    }
}

// Modal Manager
class ModalManager {
    constructor() {
        this.currentSaveCallback = null;
    }

    show(options = {}) {
        const modal = document.getElementById('modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');

        if (!modal || !title || !body) return;

        title.textContent = options.title || 'Modal';
        body.innerHTML = options.body || '';
        this.currentSaveCallback = options.onSave || null;

        modal.style.display = 'block';
    }

    hide() {
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'none';
        this.currentSaveCallback = null;
    }

    async save() {
        if (this.currentSaveCallback) {
            try {
                await this.currentSaveCallback();
            } catch (error) {
                console.error('Error al guardar:', error);
            }
        }
    }
}

// Dashboard Manager
class DashboardManager {
    constructor() {
        this.init();
    }

    init() {
        document.addEventListener('companyChanged', () => this.loadDashboardData());
    }

    async loadDashboardData() {
        if (!window.auth?.currentUser || !window.companies?.currentCompany) {
            this.clearDashboard();
            return;
        }

        try {
            const companyId = companies.currentCompany.id;
            const [contractsData, certificationsData, paymentsData, activitiesData] = await Promise.all([
                db.getAll('contracts', 'companyId', companyId),
                db.getAll('certifications', 'companyId', companyId),
                db.getAll('payments', 'companyId', companyId),
                db.getAll('activities', 'companyId', companyId)
            ]);

            this.updateStats(contractsData, certificationsData, paymentsData);
            this.renderRecentActivity(activitiesData);
        } catch (error) {
            console.error('Error al cargar dashboard:', error);
        }
    }

    updateStats(contracts, certifications, payments) {
        const activeContracts = contracts.filter(contract => contract.status === 'activo').length;
        const pendingCerts = certifications.filter(cert => cert.status === 'pendiente').length;

        let salaryToPay = 0;
        let salaryPaid = 0;

        certifications.forEach(cert => {
            const contract = contracts.find(c => c.id === cert.contractId);
            if (contract) {
                const generated = window.contractAppUtils.calculateSalaryAmount(cert.amount, contract.salaryPercentage || 0);
                const certPaid = payments
                    .filter(payment => payment.purpose === 'salary')
                    .flatMap(payment => payment.allocations || [])
                    .filter(allocation => allocation.certificationId === cert.id)
                    .reduce((sum, allocation) => sum + window.contractAppUtils.toNumber(allocation.amount), 0);

                salaryToPay += Math.max(0, generated - certPaid);
                salaryPaid += certPaid;
            }
        });

        document.getElementById('active-contracts').textContent = activeContracts;
        document.getElementById('pending-certs').textContent = pendingCerts;
        document.getElementById('salary-to-pay').textContent = window.contractAppUtils.formatCurrency(salaryToPay);
        document.getElementById('salary-paid').textContent = window.contractAppUtils.formatCurrency(salaryPaid);
    }

    renderRecentActivity(activities) {
        const activityList = document.getElementById('activity-list');
        if (!activityList) return;

        const sortedActivities = activities
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10);

        if (sortedActivities.length === 0) {
            activityList.innerHTML = '<p style="text-align: center; color: #666;">No hay actividad reciente</p>';
            return;
        }

        activityList.innerHTML = sortedActivities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas ${this.getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-content">
                    <p>${activity.description}</p>
                    <small>${new Date(activity.createdAt).toLocaleString('es-ES')}</small>
                </div>
            </div>
        `).join('');
    }

    getActivityIcon(type) {
        const icons = {
            company_create: 'fa-building',
            company_update: 'fa-edit',
            contract_create: 'fa-file-contract',
            contract_update: 'fa-edit',
            certification_create: 'fa-certificate',
            payment_create: 'fa-money-bill-wave',
            invoice_create: 'fa-receipt'
        };
        return icons[type] || 'fa-info-circle';
    }

    clearDashboard() {
        document.getElementById('active-contracts').textContent = '0';
        document.getElementById('pending-certs').textContent = '0';
        document.getElementById('salary-to-pay').textContent = '$0.00';
        document.getElementById('salary-paid').textContent = '$0.00';
        document.getElementById('activity-list').innerHTML = '<p style="text-align: center; color: #666;">No hay actividad reciente</p>';
    }
}

// Instancias globales
let app;
let modal;
let dashboard;

document.addEventListener('DOMContentLoaded', async () => {
    modal = new ModalManager();
    dashboard = new DashboardManager();
    app = new ContractManagerApp();

    window.modal = modal;
    window.dashboard = dashboard;
    window.app = app;
});
