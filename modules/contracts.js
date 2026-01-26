class Contracts {
    constructor() {
        this.currentCompany = null;
        this.init();
    }

    init() {
        document.getElementById('add-contract')?.addEventListener('click', () => this.showContractForm());
        document.getElementById('company-select')?.addEventListener('change', (e) => this.onCompanyChange(e));
        
        // Cargar empresa actual del localStorage
        this.loadCurrentCompany();
    }

    loadCurrentCompany() {
        try {
            const savedCompany = localStorage.getItem('currentCompany');
            if (savedCompany) {
                this.currentCompany = JSON.parse(savedCompany);
                this.updateCompanyUI();
                this.loadContracts();
            }
        } catch (error) {
            console.error('Error al cargar empresa:', error);
            this.currentCompany = null;
        }
    }

    async loadContracts() {
        if (!this.currentCompany || !auth.currentUser) {
            console.log('No hay empresa seleccionada o usuario no autenticado');
            return;
        }
        
        try {
            console.log('Cargando contratos para empresa:', this.currentCompany.id);
            const contracts = await db.getAll('contracts', 'companyId', this.currentCompany.id);
            console.log('Contratos encontrados:', contracts);
            this.renderContracts(contracts);
            this.updateDashboard();
        } catch (error) {
            console.error('Error al cargar contratos:', error);
            this.showMessage('Error al cargar contratos', 'error');
        }
    }

    renderContracts(contracts) {
        const tbody = document.getElementById('contracts-list');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (contracts.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="7" style="text-align: center; padding: 20px;">
                    No hay contratos registrados. Haz clic en "Nuevo Contrato" para agregar uno.
                </td>
            `;
            tbody.appendChild(row);
            return;
        }
        
        contracts.forEach(contract => {
            const serviceValue = parseFloat(contract.serviceValue) || 0;
            const contractValue = serviceValue * 1.15; // +15%
            const salaryPercentage = contract.salaryPercentage || 0;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${contract.code || 'N/A'}</td>
                <td>${contract.client || 'N/A'}</td>
                <td>$${serviceValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td>$${contractValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td>${salaryPercentage}%</td>
                <td>
                    <span class="status ${contract.status || 'activo'}">
                        ${contract.status || 'activo'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="contracts.editContract('${contract.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="contracts.deleteContract('${contract.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    showContractForm(contract = null) {
        if (!this.currentCompany) {
            this.showMessage('Primero selecciona una empresa', 'error');
            return;
        }
        
        const title = contract ? 'Editar Contrato' : 'Nuevo Contrato';
        const form = `
            <div class="form-group">
                <label for="contract-code">Código:</label>
                <input type="text" id="contract-code" value="${contract?.code || ''}" required>
                <small>Código único para identificar el contrato</small>
            </div>
            <div class="form-group">
                <label for="contract-client">Cliente:</label>
                <input type="text" id="contract-client" value="${contract?.client || ''}" required>
            </div>
            <div class="form-group">
                <label for="contract-service-value">Valor del Servicio ($):</label>
                <input type="number" id="contract-service-value" step="0.01" min="0" value="${contract?.serviceValue || ''}" required>
                <small>Valor base del servicio (sin el 15%)</small>
            </div>
            <div class="form-group">
                <label for="contract-salary-percentage">% de Salario:</label>
                <input type="number" id="contract-salary-percentage" step="0.01" min="0" max="100" value="${contract?.salaryPercentage || ''}" required>
                <small>Porcentaje calculado sobre el valor del servicio (sin el 15%)</small>
            </div>
            <div class="form-group">
                <label for="contract-start-date">Fecha de Inicio:</label>
                <input type="date" id="contract-start-date" value="${contract?.startDate || ''}">
            </div>
            <div class="form-group">
                <label for="contract-end-date">Fecha de Fin:</label>
                <input type="date" id="contract-end-date" value="${contract?.endDate || ''}">
            </div>
            <div class="form-group">
                <label for="contract-status">Estado:</label>
                <select id="contract-status">
                    <option value="activo" ${(contract?.status || 'activo') === 'activo' ? 'selected' : ''}>Activo</option>
                    <option value="finalizado" ${contract?.status === 'finalizado' ? 'selected' : ''}>Finalizado</option>
                    <option value="suspendido" ${contract?.status === 'suspendido' ? 'selected' : ''}>Suspendido</option>
                </select>
            </div>
            <div class="form-group">
                <label for="contract-description">Descripción (opcional):</label>
                <textarea id="contract-description" rows="3">${contract?.description || ''}</textarea>
            </div>
        `;
        
        modal.show({
            title: title,
            body: form,
            onSave: () => this.saveContract(contract?.id)
        });
    }

    async saveContract(id = null) {
        if (!this.currentCompany) {
            this.showMessage('No hay empresa seleccionada', 'error');
            return;
        }

        const contract = {
            code: document.getElementById('contract-code').value.trim(),
            client: document.getElementById('contract-client').value.trim(),
            serviceValue: parseFloat(document.getElementById('contract-service-value').value),
            salaryPercentage: parseFloat(document.getElementById('contract-salary-percentage').value),
            startDate: document.getElementById('contract-start-date').value,
            endDate: document.getElementById('contract-end-date').value,
            status: document.getElementById('contract-status').value,
            description: document.getElementById('contract-description').value,
            companyId: this.currentCompany.id,
            userId: auth.currentUser.id,
            createdAt: id ? undefined : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Validaciones
        if (!contract.code || !contract.client) {
            this.showMessage('El código y el cliente son requeridos', 'error');
            return;
        }
        
        if (isNaN(contract.serviceValue) || contract.serviceValue <= 0) {
            this.showMessage('El valor del servicio debe ser mayor a 0', 'error');
            return;
        }
        
        if (isNaN(contract.salaryPercentage) || contract.salaryPercentage < 0 || contract.salaryPercentage > 100) {
            this.showMessage('El porcentaje de salario debe estar entre 0 y 100', 'error');
            return;
        }
        
        try {
            if (id) {
                const existingContract = await db.get('contracts', id);
                if (existingContract) {
                    contract.createdAt = existingContract.createdAt;
                    await db.update('contracts', id, contract);
                    this.showMessage('Contrato actualizado exitosamente', 'success');
                } else {
                    this.showMessage('Contrato no encontrado', 'error');
                    return;
                }
            } else {
                await db.add('contracts', contract);
                this.showMessage('Contrato creado exitosamente', 'success');
            }
            
            modal.hide();
            await this.loadContracts();
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: this.currentCompany.id,
                type: id ? 'contract_update' : 'contract_create',
                description: `${id ? 'Actualizado' : 'Creado'} contrato ${contract.code}`
            });
            
        } catch (error) {
            console.error('Error al guardar contrato:', error);
            this.showMessage('Error al guardar el contrato: ' + error.message, 'error');
        }
    }

    async editContract(id) {
        try {
            const contract = await db.get('contracts', id);
            if (contract) {
                this.showContractForm(contract);
            } else {
                this.showMessage('Contrato no encontrado', 'error');
            }
        } catch (error) {
            console.error('Error al cargar contrato:', error);
            this.showMessage('Error al cargar el contrato', 'error');
        }
    }

    async deleteContract(id) {
        if (!confirm('¿Estás seguro de eliminar este contrato? También se eliminarán las certificaciones y pagos asociados.')) {
            return;
        }
        
        try {
            // Primero eliminar certificaciones asociadas
            const certifications = await db.getAll('certifications', 'contractId', id);
            for (const cert of certifications) {
                await db.delete('certifications', cert.id);
            }
            
            // Luego eliminar el contrato
            await db.delete('contracts', id);
            this.showMessage('Contrato eliminado exitosamente', 'success');
            await this.loadContracts();
            
            // Actualizar salarios
            if (window.salary) {
                salary.updateSalarySummary();
            }
            
            // Registrar actividad
            if (this.currentCompany) {
                await db.addActivity({
                    userId: auth.currentUser.id,
                    companyId: this.currentCompany.id,
                    type: 'contract_delete',
                    description: 'Eliminado contrato'
                });
            }
            
        } catch (error) {
            console.error('Error al eliminar contrato:', error);
            this.showMessage('Error al eliminar el contrato', 'error');
        }
    }

    onCompanyChange(event) {
        const companyId = event.target.value;
        const companies = JSON.parse(localStorage.getItem('userCompanies') || '[]');
        this.currentCompany = companies.find(c => c.id === companyId);
        
        if (this.currentCompany) {
            localStorage.setItem('currentCompany', JSON.stringify(this.currentCompany));
            this.updateCompanyUI();
            this.loadContracts();
            
            // Cargar otros módulos
            if (window.certifications) certifications.loadCertifications();
            if (window.payments) payments.loadPayments();
            if (window.salary) salary.updateSalarySummary();
        }
    }

    updateCompanyUI() {
        if (this.currentCompany) {
            const element = document.getElementById('current-company');
            if (element) {
                element.textContent = this.currentCompany.name;
            }
            const select = document.getElementById('company-select');
            if (select) {
                select.value = this.currentCompany.id;
            }
        }
    }

    updateDashboard() {
        // Esta función se implementará para actualizar las estadísticas del dashboard
        // Por ahora, solo cargamos los contratos
    }

    showMessage(message, type) {
        // Usar el sistema de mensajes de auth si está disponible
        if (window.auth && auth.showMessage) {
            auth.showMessage(message, type);
        } else {
            alert(message);
        }
    }
}

// Inicializar después de que la base de datos esté lista
let contracts;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    contracts = new Contracts();
    window.contracts = contracts;
});
