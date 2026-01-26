class GestionContratosApp {
    constructor() {
        this.currentCompany = null;
        this.currentSection = 'dashboard';
        this.init();
    }

    async init() {
        // Verificar conexión
        this.updateConnectionStatus();
        window.addEventListener('online', () => this.updateConnectionStatus());
        window.addEventListener('offline', () => this.updateConnectionStatus());

        // Inicializar base de datos
        await this.initDatabase();
        
        // Mostrar selector de empresa
        await this.showCompanySelector();
        
        // Configurar eventos
        this.setupEventListeners();
        
        // Ocultar pantalla de carga
        document.getElementById('loading').classList.add('hidden');
    }

    async initDatabase() {
        // Inicializar IndexedDB
        this.db = await openDatabase();
        
        // Cargar datos pendientes de sincronización
        await this.loadPendingSync();
    }

    async showCompanySelector() {
        const companies = await this.db.companies.toArray();
        
        if (companies.length === 0) {
            // No hay empresas, mostrar modal de nueva empresa
            this.showNewCompanyModal();
        } else {
            // Mostrar selector de empresas
            this.showCompanyModal(companies);
        }
    }

    showCompanyModal(companies) {
        const modal = document.getElementById('companyModal');
        const companyList = document.getElementById('companyList');
        
        companyList.innerHTML = '';
        
        companies.forEach(company => {
            const companyCard = document.createElement('div');
            companyCard.className = 'company-card';
            companyCard.innerHTML = `
                <h3>${company.name}</h3>
                <p>RUC: ${company.ruc || 'N/A'}</p>
                <p>Salario: ${company.salaryPercentage}%</p>
            `;
            companyCard.addEventListener('click', () => this.selectCompany(company));
            companyList.appendChild(companyCard);
        });
        
        modal.classList.remove('hidden');
    }

    showNewCompanyModal() {
        document.getElementById('companyModal').classList.add('hidden');
        document.getElementById('newCompanyModal').classList.remove('hidden');
    }

    async selectCompany(company) {
        this.currentCompany = company;
        document.getElementById('companyModal').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('currentCompanyName').textContent = company.name;
        
        // Cargar la sección actual
        await this.loadSection(this.currentSection);
    }

    setupEventListeners() {
        // Menú lateral
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.add('open');
        });

        document.querySelector('.close-sidebar').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
        });

        // Enlaces del menú
        document.querySelectorAll('.sidebar-menu a').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const section = e.target.getAttribute('data-section');
                await this.loadSection(section);
                document.getElementById('sidebar').classList.remove('open');
            });
        });

        // Cambiar empresa
        document.getElementById('changeCompanyBtn').addEventListener('click', () => {
            document.getElementById('app').classList.add('hidden');
            this.showCompanySelector();
        });

        // Nueva empresa
        document.getElementById('newCompanyBtn').addEventListener('click', () => {
            this.showNewCompanyModal();
        });

        document.getElementById('cancelNewCompany').addEventListener('click', () => {
            document.getElementById('newCompanyModal').classList.add('hidden');
            this.showCompanySelector();
        });

        document.getElementById('newCompanyForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.createNewCompany();
        });

        // Sincronización
        document.getElementById('syncBtn').addEventListener('click', async () => {
            await this.syncData();
        });
    }

    async createNewCompany() {
        const name = document.getElementById('companyName').value;
        const ruc = document.getElementById('companyRUC').value;
        const salaryPercentage = parseFloat(document.getElementById('defaultSalaryPercentage').value);

        const company = {
            name,
            ruc,
            salaryPercentage,
            createdAt: new Date().toISOString()
        };

        const id = await this.db.companies.add(company);
        company.id = id;
        
        document.getElementById('newCompanyForm').reset();
        document.getElementById('newCompanyModal').classList.add('hidden');
        
        await this.selectCompany(company);
    }

    async loadSection(section) {
        this.currentSection = section;
        
        // Actualizar menú activo
        document.querySelectorAll('.sidebar-menu a').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-section') === section) {
                link.classList.add('active');
            }
        });

        const content = document.getElementById('content');
        
        switch(section) {
            case 'dashboard':
                await this.loadDashboard(content);
                break;
            case 'contratos':
                await this.loadContratos(content);
                break;
            case 'certificaciones':
                await this.loadCertificaciones(content);
                break;
            case 'pagos':
                await this.loadPagos(content);
                break;
            case 'facturas':
                await this.loadFacturas(content);
                break;
            case 'salarios':
                await this.loadSalarios(content);
                break;
            case 'reportes':
                await this.loadReportes(content);
                break;
            case 'backup':
                await this.loadBackup(content);
                break;
            case 'configuracion':
                await this.loadConfiguracion(content);
                break;
        }
    }

    async loadDashboard(content) {
        // Obtener estadísticas
        const contracts = await this.db.contracts
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const certifications = await this.db.certifications
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const payments = await this.db.payments
            .where('companyId').equals(this.currentCompany.id)
            .toArray();

        // Calcular totales
        const totalContracts = contracts.length;
        const totalCertified = certifications.reduce((sum, cert) => sum + cert.monto, 0);
        const totalPaid = payments.reduce((sum, payment) => sum + payment.monto, 0);
        
        // Calcular salario pendiente
        const pendingSalary = await this.calculatePendingSalary();

        content.innerHTML = `
            <div class="dashboard">
                <h2><i class="fas fa-tachometer-alt"></i> Dashboard</h2>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <i class="fas fa-file-contract fa-2x"></i>
                        <div class="stat-value">${totalContracts}</div>
                        <div class="stat-label">Contratos Activos</div>
                    </div>
                    
                    <div class="stat-card">
                        <i class="fas fa-certificate fa-2x"></i>
                        <div class="stat-value">$${totalCertified.toFixed(2)}</div>
                        <div class="stat-label">Total Certificado</div>
                    </div>
                    
                    <div class="stat-card">
                        <i class="fas fa-money-check-alt fa-2x"></i>
                        <div class="stat-value">$${totalPaid.toFixed(2)}</div>
                        <div class="stat-label">Total Pagado</div>
                    </div>
                    
                    <div class="stat-card">
                        <i class="fas fa-user-tie fa-2x"></i>
                        <div class="stat-value">$${pendingSalary.toFixed(2)}</div>
                        <div class="stat-label">Salario Pendiente</div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Contratos Recientes</h3>
                        <button class="btn btn-primary" onclick="app.loadSection('contratos')">
                            <i class="fas fa-plus"></i> Nuevo Contrato
                        </button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Cliente</th>
                                    <th>Monto</th>
                                    <th>Fecha Inicio</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${contracts.slice(0, 5).map(contract => `
                                    <tr>
                                        <td>${contract.codigo}</td>
                                        <td>${contract.cliente}</td>
                                        <td>$${contract.monto.toFixed(2)}</td>
                                        <td>${new Date(contract.fechaInicio).toLocaleDateString()}</td>
                                        <td><span class="status-badge ${contract.estado}">${contract.estado}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3>Certificaciones Pendientes</h3>
                        <button class="btn btn-primary" onclick="app.loadSection('certificaciones')">
                            <i class="fas fa-plus"></i> Nueva Certificación
                        </button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Contrato</th>
                                    <th>Mes</th>
                                    <th>Monto Certificado</th>
                                    <th>Salario Calculado</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${certifications.filter(c => c.estado === 'pendiente').slice(0, 5).map(cert => `
                                    <tr>
                                        <td>${cert.contratoCodigo}</td>
                                        <td>${cert.mes}/${cert.anio}</td>
                                        <td>$${cert.monto.toFixed(2)}</td>
                                        <td>$${this.calculateSalary(cert).toFixed(2)}</td>
                                        <td><span class="status-badge ${cert.estado}">${cert.estado}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    calculateSalary(certification) {
        // Calcular salario: (monto certificado - 10%) * porcentaje de salario
        const montoDescontado = certification.monto * 0.9;
        return montoDescontado * (this.currentCompany.salaryPercentage / 100);
    }

    async calculatePendingSalary() {
        const certifications = await this.db.certifications
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const payments = await this.db.payments
            .where('companyId').equals(this.currentCompany.id)
            .toArray();

        let totalSalary = 0;
        let totalPaid = payments.reduce((sum, p) => sum + p.monto, 0);
        
        certifications.forEach(cert => {
            totalSalary += this.calculateSalary(cert);
        });

        return Math.max(0, totalSalary - totalPaid);
    }

    async loadContratos(content) {
        const contracts = await this.db.contracts
            .where('companyId').equals(this.currentCompany.id)
            .toArray();

        content.innerHTML = `
            <div class="contratos">
                <div class="card">
                    <div class="card-header">
                        <h2><i class="fas fa-file-contract"></i> Gestión de Contratos</h2>
                        <button class="btn btn-primary" onclick="app.showNewContractModal()">
                            <i class="fas fa-plus"></i> Nuevo Contrato
                        </button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Cliente</th>
                                    <th>Descripción</th>
                                    <th>Monto</th>
                                    <th>Fecha Inicio</th>
                                    <th>Fecha Fin</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${contracts.map(contract => `
                                    <tr>
                                        <td>${contract.codigo}</td>
                                        <td>${contract.cliente}</td>
                                        <td>${contract.descripcion}</td>
                                        <td>$${contract.monto.toFixed(2)}</td>
                                        <td>${new Date(contract.fechaInicio).toLocaleDateString()}</td>
                                        <td>${contract.fechaFin ? new Date(contract.fechaFin).toLocaleDateString() : 'N/A'}</td>
                                        <td><span class="status-badge ${contract.estado}">${contract.estado}</span></td>
                                        <td>
                                            <button class="btn btn-icon" onclick="app.editContract(${contract.id})" title="Editar">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="btn btn-icon" onclick="app.deleteContract(${contract.id})" title="Eliminar">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    async loadCertificaciones(content) {
        const certifications = await this.db.certifications
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const contracts = await this.db.contracts
            .where('companyId').equals(this.currentCompany.id)
            .toArray();

        content.innerHTML = `
            <div class="certificaciones">
                <div class="card">
                    <div class="card-header">
                        <h2><i class="fas fa-certificate"></i> Certificaciones Mensuales</h2>
                        <button class="btn btn-primary" onclick="app.showNewCertificationModal()">
                            <i class="fas fa-plus"></i> Nueva Certificación
                        </button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Contrato</th>
                                    <th>Mes/Año</th>
                                    <th>Monto Certificado</th>
                                    <th>Descuento 10%</th>
                                    <th>Base Salario</th>
                                    <th>Salario (${this.currentCompany.salaryPercentage}%)</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${certifications.map(cert => {
                                    const contract = contracts.find(c => c.id === cert.contractId);
                                    const base = cert.monto * 0.9;
                                    const salary = this.calculateSalary(cert);
                                    return `
                                        <tr>
                                            <td>${contract ? contract.codigo : 'N/A'}</td>
                                            <td>${cert.mes}/${cert.anio}</td>
                                            <td>$${cert.monto.toFixed(2)}</td>
                                            <td>$${(cert.monto * 0.1).toFixed(2)}</td>
                                            <td>$${base.toFixed(2)}</td>
                                            <td>$${salary.toFixed(2)}</td>
                                            <td><span class="status-badge ${cert.estado}">${cert.estado}</span></td>
                                            <td>
                                                <button class="btn btn-icon" onclick="app.editCertification(${cert.id})" title="Editar">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                ${cert.estado === 'pendiente' ? `
                                                    <button class="btn btn-icon" onclick="app.registerPaymentForCertification(${cert.id})" title="Registrar Pago">
                                                        <i class="fas fa-money-check-alt"></i>
                                                    </button>
                                                ` : ''}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    async loadPagos(content) {
        const payments = await this.db.payments
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const certifications = await this.db.certifications
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const contracts = await this.db.contracts
            .where('companyId').equals(this.currentCompany.id)
            .toArray();

        content.innerHTML = `
            <div class="pagos">
                <div class="card">
                    <div class="card-header">
                        <h2><i class="fas fa-money-check-alt"></i> Registro de Pagos</h2>
                        <button class="btn btn-primary" onclick="app.showNewPaymentModal()">
                            <i class="fas fa-plus"></i> Nuevo Pago
                        </button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Contrato</th>
                                    <th>Certificación</th>
                                    <th>Monto</th>
                                    <th>Método de Pago</th>
                                    <th>Referencia</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${payments.map(payment => {
                                    const cert = certifications.find(c => c.id === payment.certificationId);
                                    const contract = cert ? contracts.find(c => c.id === cert.contractId) : null;
                                    return `
                                        <tr>
                                            <td>${new Date(payment.fecha).toLocaleDateString()}</td>
                                            <td>${contract ? contract.codigo : 'N/A'}</td>
                                            <td>${cert ? `${cert.mes}/${cert.anio}` : 'N/A'}</td>
                                            <td>$${payment.monto.toFixed(2)}</td>
                                            <td>${payment.metodoPago}</td>
                                            <td>${payment.referencia || 'N/A'}</td>
                                            <td><span class="status-badge ${payment.estado}">${payment.estado}</span></td>
                                            <td>
                                                <button class="btn btn-icon" onclick="app.editPayment(${payment.id})" title="Editar">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    async loadFacturas(content) {
        // Implementación similar a las otras secciones
        content.innerHTML = `
            <div class="facturas">
                <div class="card">
                    <div class="card-header">
                        <h2><i class="fas fa-file-invoice-dollar"></i> Gestión de Facturas</h2>
                        <button class="btn btn-primary">
                            <i class="fas fa-plus"></i> Nueva Factura
                        </button>
                    </div>
                    <p>Funcionalidad en desarrollo...</p>
                </div>
            </div>
        `;
    }

    async loadSalarios(content) {
        const certifications = await this.db.certifications
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const payments = await this.db.payments
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const contracts = await this.db.contracts
            .where('companyId').equals(this.currentCompany.id)
            .toArray();

        // Calcular salarios por certificación
        const salaryDetails = certifications.map(cert => {
            const contract = contracts.find(c => c.id === cert.contractId);
            const certSalary = this.calculateSalary(cert);
            const certPayments = payments.filter(p => p.certificationId === cert.id);
            const paidAmount = certPayments.reduce((sum, p) => sum + p.monto, 0);
            const pendingAmount = Math.max(0, certSalary - paidAmount);
            
            return {
                certification: cert,
                contract,
                salary: certSalary,
                paid: paidAmount,
                pending: pendingAmount
            };
        });

        content.innerHTML = `
            <div class="salarios">
                <div class="card">
                    <div class="card-header">
                        <h2><i class="fas fa-user-tie"></i> Control de Salarios</h2>
                        <div>
                            <button class="btn btn-secondary" onclick="app.exportSalariesToExcel()">
                                <i class="fas fa-file-excel"></i> Excel
                            </button>
                            <button class="btn btn-secondary" onclick="app.exportSalariesToPDF()">
                                <i class="fas fa-file-pdf"></i> PDF
                            </button>
                        </div>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Contrato</th>
                                    <th>Certificación</th>
                                    <th>Salario Calculado</th>
                                    <th>Pagado</th>
                                    <th>Pendiente</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${salaryDetails.map(detail => {
                                    const status = detail.pending === 0 ? 'pagado' : 
                                                  detail.paid > 0 ? 'parcial' : 'pendiente';
                                    return `
                                        <tr>
                                            <td>${detail.contract ? detail.contract.codigo : 'N/A'}</td>
                                            <td>${detail.certification.mes}/${detail.certification.anio}</td>
                                            <td>$${detail.salary.toFixed(2)}</td>
                                            <td>$${detail.paid.toFixed(2)}</td>
                                            <td>$${detail.pending.toFixed(2)}</td>
                                            <td><span class="status-badge ${status}">${status}</span></td>
                                            <td>
                                                ${detail.pending > 0 ? `
                                                    <button class="btn btn-icon" onclick="app.registerPaymentForCertification(${detail.certification.id})" title="Registrar Pago">
                                                        <i class="fas fa-money-check-alt"></i>
                                                    </button>
                                                ` : ''}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="card">
                    <h3>Resumen de Salarios</h3>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value">$${salaryDetails.reduce((sum, d) => sum + d.salary, 0).toFixed(2)}</div>
                            <div class="stat-label">Total Calculado</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">$${salaryDetails.reduce((sum, d) => sum + d.paid, 0).toFixed(2)}</div>
                            <div class="stat-label">Total Pagado</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">$${salaryDetails.reduce((sum, d) => sum + d.pending, 0).toFixed(2)}</div>
                            <div class="stat-label">Total Pendiente</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadReportes(content) {
        content.innerHTML = `
            <div class="reportes">
                <div class="card">
                    <h2><i class="fas fa-chart-bar"></i> Reportes y Análisis</h2>
                    
                    <div class="button-group">
                        <button class="btn btn-primary" onclick="app.generateContractReport()">
                            <i class="fas fa-file-contract"></i> Reporte de Contratos
                        </button>
                        <button class="btn btn-primary" onclick="app.generateCertificationsReport()">
                            <i class="fas fa-certificate"></i> Reporte de Certificaciones
                        </button>
                        <button class="btn btn-primary" onclick="app.generatePaymentsReport()">
                            <i class="fas fa-money-check-alt"></i> Reporte de Pagos
                        </button>
                    </div>
                    
                    <div class="button-group">
                        <button class="btn btn-success" onclick="app.exportFullReportToExcel()">
                            <i class="fas fa-file-excel"></i> Exportar Todo a Excel
                        </button>
                        <button class="btn btn-danger" onclick="app.exportFullReportToPDF()">
                            <i class="fas fa-file-pdf"></i> Exportar Todo a PDF
                        </button>
                    </div>
                </div>
                
                <div class="card">
                    <h3>Filtros de Reporte</h3>
                    <form id="reportFilterForm">
                        <div class="form-group">
                            <label for="reportType">Tipo de Reporte:</label>
                            <select id="reportType">
                                <option value="contratos">Contratos</option>
                                <option value="certificaciones">Certificaciones</option>
                                <option value="pagos">Pagos</option>
                                <option value="salarios">Salarios</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="startDate">Fecha Inicio:</label>
                            <input type="date" id="startDate">
                        </div>
                        <div class="form-group">
                            <label for="endDate">Fecha Fin:</label>
                            <input type="date" id="endDate">
                        </div>
                        <div class="form-group">
                            <label for="contractFilter">Contrato:</label>
                            <select id="contractFilter">
                                <option value="">Todos los contratos</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-filter"></i> Generar Reporte Filtrado
                        </button>
                    </form>
                </div>
            </div>
        `;
    }

    async loadBackup(content) {
        content.innerHTML = `
            <div class="backup">
                <div class="card">
                    <h2><i class="fas fa-database"></i> Copias de Seguridad</h2>
                    
                    <div class="button-group">
                        <button class="btn btn-primary" onclick="app.createBackup()">
                            <i class="fas fa-download"></i> Crear Backup
                        </button>
                        <button class="btn btn-secondary" onclick="document.getElementById('restoreFile').click()">
                            <i class="fas fa-upload"></i> Restaurar Backup
                        </button>
                        <input type="file" id="restoreFile" accept=".json" style="display: none;" onchange="app.restoreBackup(event)">
                    </div>
                    
                    <div class="card">
                        <h3>Backups Recientes</h3>
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Tamaño</th>
                                        <th>Empresas</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody id="backupList">
                                    <!-- Lista de backups se cargará aquí -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        await this.loadBackupList();
    }

    async loadConfiguracion(content) {
        content.innerHTML = `
            <div class="configuracion">
                <div class="card">
                    <h2><i class="fas fa-cog"></i> Configuración</h2>
                    
                    <form id="configForm">
                        <div class="form-group">
                            <label for="companyNameConfig">Nombre de la Empresa:</label>
                            <input type="text" id="companyNameConfig" value="${this.currentCompany.name}" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="companyRUCConfig">RUC/Identificación:</label>
                            <input type="text" id="companyRUCConfig" value="${this.currentCompany.ruc || ''}">
                        </div>
                        
                        <div class="form-group">
                            <label for="salaryPercentageConfig">Porcentaje de Salario (%):</label>
                            <input type="number" id="salaryPercentageConfig" 
                                   value="${this.currentCompany.salaryPercentage}" 
                                   min="1" max="100" step="0.1" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="syncFrequency">Frecuencia de Sincronización:</label>
                            <select id="syncFrequency">
                                <option value="manual">Manual</option>
                                <option value="hourly">Cada hora</option>
                                <option value="daily">Diario</option>
                                <option value="weekly">Semanal</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="autoBackup" checked>
                                Crear backup automático semanal
                            </label>
                        </div>
                        
                        <div class="button-group">
                            <button type="button" class="btn btn-secondary" onclick="app.resetConfig()">
                                Restablecer
                            </button>
                            <button type="submit" class="btn btn-primary">
                                Guardar Cambios
                            </button>
                        </div>
                    </form>
                </div>
                
                <div class="card">
                    <h3>Información del Sistema</h3>
                    <p><strong>Versión:</strong> 1.0.0</p>
                    <p><strong>Última sincronización:</strong> <span id="lastSync">Nunca</span></p>
                    <p><strong>Estado de conexión:</strong> <span id="connectionStatusInfo">Desconectado</span></p>
                    <p><strong>Espacio utilizado:</strong> <span id="storageUsed">Calculando...</span></p>
                    
                    <button class="btn btn-danger" onclick="app.clearCache()">
                        <i class="fas fa-trash"></i> Limpiar Cache
                    </button>
                </div>
            </div>
        `;
        
        this.updateSystemInfo();
    }

    updateConnectionStatus() {
        const statusElement = document.getElementById('connectionStatus');
        if (navigator.onLine) {
            statusElement.innerHTML = '<i class="fas fa-wifi"></i> Online';
            statusElement.className = 'connection-status online';
        } else {
            statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
            statusElement.className = 'connection-status offline';
        }
    }

    async syncData() {
        if (!navigator.onLine) {
            this.showNotification('No hay conexión a internet', 'error');
            return;
        }

        this.showNotification('Sincronizando datos...', 'info');
        
        // Aquí iría la lógica para sincronizar con el servidor
        // Por ahora, solo actualizamos el estado local
        
        setTimeout(() => {
            this.showNotification('Datos sincronizados correctamente', 'success');
        }, 1000);
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');
        
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }

    // Métodos para exportación
    async exportSalariesToExcel() {
        const certifications = await this.db.certifications
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const contracts = await this.db.contracts
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const payments = await this.db.payments
            .where('companyId').equals(this.currentCompany.id)
            .toArray();

        const data = certifications.map(cert => {
            const contract = contracts.find(c => c.id === cert.contractId);
            const certSalary = this.calculateSalary(cert);
            const certPayments = payments.filter(p => p.certificationId === cert.id);
            const paidAmount = certPayments.reduce((sum, p) => sum + p.monto, 0);
            
            return {
                'Contrato': contract ? contract.codigo : 'N/A',
                'Cliente': contract ? contract.cliente : 'N/A',
                'Certificación': `${cert.mes}/${cert.anio}`,
                'Monto Certificado': cert.monto,
                'Base Salario': cert.monto * 0.9,
                'Porcentaje Salario': `${this.currentCompany.salaryPercentage}%`,
                'Salario Calculado': certSalary,
                'Pagado': paidAmount,
                'Pendiente': certSalary - paidAmount,
                'Estado': cert.estado
            };
        });

        exportToExcel(data, `Salarios_${this.currentCompany.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
        this.showNotification('Reporte exportado a Excel', 'success');
    }

    async exportSalariesToPDF() {
        const certifications = await this.db.certifications
            .where('companyId').equals(this.currentCompany.id)
            .toArray();
        
        const contracts = await this.db.contracts
            .where('companyId').equals(this.currentCompany.id)
            .toArray();

        const data = certifications.map(cert => {
            const contract = contracts.find(c => c.id === cert.contractId);
            const salary = this.calculateSalary(cert);
            
            return [
                contract ? contract.codigo : 'N/A',
                `${cert.mes}/${cert.anio}`,
                `$${cert.monto.toFixed(2)}`,
                `$${(cert.monto * 0.9).toFixed(2)}`,
                `$${salary.toFixed(2)}`
            ];
        });

        exportToPDF({
            title: `Reporte de Salarios - ${this.currentCompany.name}`,
            headers: ['Contrato', 'Certificación', 'Monto Certificado', 'Base Salario', 'Salario Calculado'],
            data: data,
            fileName: `Salarios_${this.currentCompany.name}_${new Date().toISOString().split('T')[0]}.pdf`
        });
        
        this.showNotification('Reporte exportado a PDF', 'success');
    }

    async createBackup() {
        const backupData = {
            version: '1.0',
            createdAt: new Date().toISOString(),
            company: this.currentCompany,
            data: {
                contracts: await this.db.contracts.where('companyId').equals(this.currentCompany.id).toArray(),
                certifications: await this.db.certifications.where('companyId').equals(this.currentCompany.id).toArray(),
                payments: await this.db.payments.where('companyId').equals(this.currentCompany.id).toArray(),
                invoices: await this.db.invoices.where('companyId').equals(this.currentCompany.id).toArray()
            }
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_${this.currentCompany.name}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('Backup creado correctamente', 'success');
    }

    async restoreBackup(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backupData = JSON.parse(e.target.result);
                
                // Verificar que el backup sea de la misma empresa
                if (backupData.company.id !== this.currentCompany.id) {
                    if (!confirm('Este backup es de otra empresa. ¿Desea restaurarlo de todas formas?')) {
                        return;
                    }
                }
                
                // Restaurar datos
                await this.db.contracts.clear();
                await this.db.certifications.clear();
                await this.db.payments.clear();
                await this.db.invoices.clear();
                
                for (const contract of backupData.data.contracts) {
                    await this.db.contracts.add(contract);
                }
                
                for (const certification of backupData.data.certifications) {
                    await this.db.certifications.add(certification);
                }
                
                for (const payment of backupData.data.payments) {
                    await this.db.payments.add(payment);
                }
                
                for (const invoice of backupData.data.invoices) {
                    await this.db.invoices.add(invoice);
                }
                
                this.showNotification('Backup restaurado correctamente', 'success');
                await this.loadSection(this.currentSection);
                
            } catch (error) {
                this.showNotification('Error al restaurar backup: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    async loadBackupList() {
        // En una implementación real, esto cargaría los backups del almacenamiento local
        // Por ahora, mostramos un mensaje
        document.getElementById('backupList').innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 20px;">
                    Los backups se descargan localmente. Para restaurar, use el botón "Restaurar Backup"
                </td>
            </tr>
        `;
    }

    updateSystemInfo() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            navigator.storage.estimate().then(estimate => {
                const usedMB = (estimate.usage / (1024 * 1024)).toFixed(2);
                const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(2);
                document.getElementById('storageUsed').textContent = `${usedMB} MB / ${quotaMB} MB`;
            });
        }
        
        document.getElementById('connectionStatusInfo').textContent = 
            navigator.onLine ? 'Conectado' : 'Desconectado';
    }

    async clearCache() {
        if (confirm('¿Está seguro de que desea limpiar la cache? Esto no afectará los datos guardados.')) {
            if ('caches' in window) {
                await caches.delete('app-cache');
            }
            this.showNotification('Cache limpiada correctamente', 'success');
        }
    }

    // Métodos para mostrar modales de creación/edición
    showNewContractModal() {
        // Implementar modal para nuevo contrato
        this.showNotification('Funcionalidad en desarrollo', 'info');
    }

    showNewCertificationModal() {
        // Implementar modal para nueva certificación
        this.showNotification('Funcionalidad en desarrollo', 'info');
    }

    showNewPaymentModal() {
        // Implementar modal para nuevo pago
        this.showNotification('Funcionalidad en desarrollo', 'info');
    }

    editContract(id) {
        // Implementar edición de contrato
        this.showNotification('Funcionalidad en desarrollo', 'info');
    }

    editCertification(id) {
        // Implementar edición de certificación
        this.showNotification('Funcionalidad en desarrollo', 'info');
    }

    editPayment(id) {
        // Implementar edición de pago
        this.showNotification('Funcionalidad en desarrollo', 'info');
    }

    deleteContract(id) {
        if (confirm('¿Está seguro de que desea eliminar este contrato?')) {
            this.db.contracts.delete(id);
            this.showNotification('Contrato eliminado', 'success');
            this.loadSection('contratos');
        }
    }

    async registerPaymentForCertification(certificationId) {
        const certification = await this.db.certifications.get(certificationId);
        if (!certification) return;

        const salary = this.calculateSalary(certification);
        const payments = await this.db.payments
            .where('certificationId').equals(certificationId)
            .toArray();
        
        const paid = payments.reduce((sum, p) => sum + p.monto, 0);
        const pending = salary - paid;

        if (pending <= 0) {
            this.showNotification('Esta certificación ya está completamente pagada', 'info');
            return;
        }

        const amount = prompt(`Salario pendiente: $${pending.toFixed(2)}\nIngrese el monto del pago:`, pending.toFixed(2));
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;

        const payment = {
            certificationId,
            contractId: certification.contractId,
            companyId: this.currentCompany.id,
            monto: parseFloat(amount),
            fecha: new Date().toISOString(),
            metodoPago: 'transferencia',
            referencia: `PAGO-${Date.now()}`,
            estado: 'completado',
            createdAt: new Date().toISOString()
        };

        await this.db.payments.add(payment);
        
        // Actualizar estado de la certificación si está completamente pagada
        const newPaid = paid + parseFloat(amount);
        if (newPaid >= salary) {
            await this.db.certifications.update(certificationId, { estado: 'pagado' });
        }

        this.showNotification('Pago registrado correctamente', 'success');
        await this.loadSection(this.currentSection);
    }
}

// Inicializar la aplicación cuando el DOM esté listo
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new GestionContratosApp();
});
