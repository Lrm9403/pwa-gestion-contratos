class Contracts {
    constructor() {
        this.currentCompany = null;
        this.init();
    }

    init() {
        document.getElementById('add-contract')?.addEventListener('click', () => this.showContractForm());
        document.getElementById('company-select')?.addEventListener('change', (e) => this.onCompanyChange(e));
        
        // Cargar empresa actual
        const savedCompany = localStorage.getItem('currentCompany');
        if (savedCompany) {
            this.currentCompany = JSON.parse(savedCompany);
            this.updateCompanyUI();
            this.loadContracts();
        }
    }

    async loadContracts() {
        if (!this.currentCompany || !auth.currentUser) return;
        
        try {
            const contracts = await db.getAll('contracts', 'companyId', this.currentCompany.id);
            this.renderContracts(contracts);
            this.updateDashboard();
        } catch (error) {
            console.error('Error al cargar contratos:', error);
        }
    }

    renderContracts(contracts) {
        const tbody = document.getElementById('contracts-list');
        tbody.innerHTML = '';
        
        contracts.forEach(contract => {
            const serviceValue = parseFloat(contract.serviceValue);
            const contractValue = serviceValue * 1.15; // +15%
            const salaryPercentage = contract.salaryPercentage || 0;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${contract.code}</td>
                <td>${contract.client}</td>
                <td>$${serviceValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td>$${contractValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td>${salaryPercentage}%</td>
                <td><span class="status ${contract.status}">${contract.status}</span></td>
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
        const title = contract ? 'Editar Contrato' : 'Nuevo Contrato';
        const form = `
            <div class="form-group">
                <label for="contract-code">Código:</label>
                <input type="text" id="contract-code" value="${contract?.code || ''}" required>
            </div>
            <div class="form-group">
                <label for="contract-client">Cliente:</label>
                <input type="text" id="contract-client" value="${contract?.client || ''}" required>
            </div>
            <div class="form-group">
                <label for="contract-service-value">Valor del Servicio ($):</label>
                <input type="number" id="contract-service-value" step="0.01" value="${contract?.serviceValue || ''}" required>
            </div>
            <div class="form-group">
                <label for="contract-salary-percentage">% de Salario:</label>
                <input type="number" id="contract-salary-percentage" step="0.01" value="${contract?.salaryPercentage || ''}" required>
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
                    <option value="activo" ${contract?.status === 'activo' ? 'selected' : ''}>Activo</option>
                    <option value="finalizado" ${contract?.status === 'finalizado' ? 'selected' : ''}>Finalizado</option>
                    <option value="suspendido" ${contract?.status === 'suspendido' ? 'selected' : ''}>Suspendido</option>
                </select>
            </div>
        `;
        
        modal.show({
            title: title,
            body: form,
            onSave: () => this.saveContract(contract?.id)
        });
    }

    async saveContract(id = null) {
        const contract = {
            code: document.getElementById('contract-code').value,
            client: document.getElementById('contract-client').value,
            serviceValue: parseFloat(document.getElementById('contract-service-value').value),
            salaryPercentage: parseFloat(document.getElementById('contract-salary-percentage').value),
            startDate: document.getElementById('contract-start-date').value,
            endDate: document.getElementById('contract-end-date').value,
            status: document.getElementById('contract-status').value,
            companyId: this.currentCompany.id,
            userId: auth.currentUser.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (!contract.code || !contract.client || isNaN(contract.serviceValue) || isNaN(contract.salaryPercentage)) {
            auth.showMessage('Por favor completa todos los campos requeridos', 'error');
            return;
        }
        
        try {
            if (id) {
                await db.update('contracts', id, contract);
                auth.showMessage('Contrato actualizado exitosamente', 'success');
            } else {
                await db.add('contracts', contract);
                auth.showMessage('Contrato creado exitosamente', 'success');
            }
            
            modal.hide();
            this.loadContracts();
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: this.currentCompany.id,
                type: id ? 'contract_update' : 'contract_create',
                description: `${id ? 'Actualizado' : 'Creado'} contrato ${contract.code}`
            });
            
        } catch (error) {
            auth.showMessage('Error al guardar el contrato', 'error');
            console.error(error);
        }
    }

    async editContract(id) {
        try {
            const contract = await db.get('contracts', id);
            if (contract) {
                this.showContractForm(contract);
            }
        } catch (error) {
            console.error('Error al cargar contrato:', error);
        }
    }

    async deleteContract(id) {
        if (!confirm('¿Estás seguro de eliminar este contrato?')) return;
        
        try {
            await db.delete('contracts', id);
            auth.showMessage('Contrato eliminado exitosamente', 'success');
            this.loadContracts();
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: this.currentCompany.id,
                type: 'contract_delete',
                description: 'Eliminado contrato'
            });
            
        } catch (error) {
            auth.showMessage('Error al eliminar el contrato', 'error');
            console.error(error);
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
            certifications.loadCertifications();
            payments.loadPayments();
            salary.updateSalarySummary();
        }
    }

    updateCompanyUI() {
        if (this.currentCompany) {
            document.getElementById('current-company').textContent = this.currentCompany.name;
            const select = document.getElementById('company-select');
            select.value = this.currentCompany.id;
        }
    }

    updateDashboard() {
        // Esta función se implementará para actualizar las estadísticas del dashboard
    }
}

const contracts = new Contracts();
