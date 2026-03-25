class Contracts {
    constructor() {
        this.currentCompany = null;
        this.utils = window.contractAppUtils;
        this.init();
    }

    init() {
        document.getElementById('add-contract')?.addEventListener('click', () => this.showContractForm());
        document.addEventListener('companyChanged', (event) => {
            this.currentCompany = event.detail.company || null;
            this.updateCompanyUI();
            this.loadContracts();
        });
        this.loadCurrentCompany();
    }

    loadCurrentCompany() {
        try {
            const savedCompany = localStorage.getItem('currentCompany');
            this.currentCompany = savedCompany ? JSON.parse(savedCompany) : null;
            this.updateCompanyUI();
        } catch (error) {
            console.error('Error al cargar empresa:', error);
            this.currentCompany = null;
        }
    }

    getCompanyTaxPercentage() {
        return this.utils.getCompanyTaxPercentage(this.currentCompany || companies?.currentCompany);
    }

    buildContractSummary(contract) {
        const baseServiceValue = this.utils.toNumber(contract.serviceValue);
        const supplements = Array.isArray(contract.supplements) ? contract.supplements : [];
        const supplementsValue = this.utils.roundMoney(
            supplements.reduce((sum, supplement) => sum + this.utils.toNumber(supplement.amount), 0)
        );
        const serviceValue = this.utils.roundMoney(baseServiceValue + supplementsValue);
        const taxPercentage = this.getCompanyTaxPercentage();
        return {
            baseServiceValue,
            supplementsValue,
            serviceValue,
            taxPercentage,
            totalValue: this.utils.calculateTotalWithTax(serviceValue, taxPercentage),
            taxAmount: this.utils.calculateTaxAmount(serviceValue, taxPercentage),
            salaryPercentage: this.utils.toNumber(contract.salaryPercentage)
        };
    }

    async loadContracts() {
        if (!this.currentCompany || !auth?.currentUser) {
            this.renderContracts([]);
            this.updateDashboard([]);
            return;
        }

        try {
            const contracts = await db.getAll('contracts', 'companyId', this.currentCompany.id);
            this.renderContracts(contracts);
            this.updateDashboard(contracts);
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
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 20px;">
                        No hay contratos registrados. Haz clic en "Nuevo Contrato" para agregar uno.
                    </td>
                </tr>
            `;
            return;
        }

        contracts.forEach(contract => {
            const summary = this.buildContractSummary(contract);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${contract.code || 'N/A'}</td>
                <td>${contract.name || 'Sin nombre'}</td>
                <td>${contract.client || 'N/A'}</td>
                <td>
                    ${this.utils.formatCurrency(summary.serviceValue)}<br>
                    <small>Base: ${this.utils.formatCurrency(summary.baseServiceValue)} · Supl.: ${this.utils.formatCurrency(summary.supplementsValue)}</small>
                </td>
                <td>
                    ${this.utils.formatCurrency(summary.totalValue)}<br>
                    <small>Impuestos: ${this.utils.formatPercentage(summary.taxPercentage, companies?.currentCompany?.taxPercentageRaw)}</small>
                </td>
                <td>${this.utils.formatPercentage(summary.salaryPercentage, contract.salaryPercentageRaw)}</td>
                <td><span class="status ${contract.status || 'activo'}">${contract.status || 'activo'}</span></td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="contracts.editContract('${contract.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-primary" onclick="contracts.showSupplementForm('${contract.id}')"><i class="fas fa-file-circle-plus"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="contracts.deleteContract('${contract.id}')"><i class="fas fa-trash"></i></button>
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

        const taxPercentage = this.getCompanyTaxPercentage();
        const taxPercentageRaw = this.currentCompany?.taxPercentageRaw;
        const title = contract ? 'Editar Contrato' : 'Nuevo Contrato';
        const form = `
            <div class="form-group">
                <label for="contract-code">Código *:</label>
                <input type="text" id="contract-code" value="${contract?.code || ''}" required>
                <small>Código único para identificar el contrato.</small>
            </div>
            <div class="form-group">
                <label for="contract-name">Nombre del contrato *:</label>
                <input type="text" id="contract-name" value="${contract?.name || ''}" required>
            </div>
            <div class="form-group">
                <label for="contract-client">Cliente *:</label>
                <input type="text" id="contract-client" value="${contract?.client || ''}" required>
            </div>
            <div class="form-group">
                <label for="contract-service-value">Valor del servicio ($) *:</label>
                <input type="number" id="contract-service-value" step="0.01" min="0.01" value="${contract?.serviceValue || ''}" required>
            </div>
            <div class="form-group">
                <label for="contract-salary-percentage">% de salario *:</label>
                <input type="number" id="contract-salary-percentage" step="0.01" min="0" max="100" value="${contract?.salaryPercentageRaw ?? contract?.salaryPercentage ?? ''}" required>
                <small>Este porcentaje se calcula sobre el valor del servicio y luego se aplica a cada certificación mensual.</small>
            </div>
            <div class="form-group">
                <label>% de impuestos de la empresa:</label>
                <input type="text" value="${this.utils.formatPercentage(taxPercentage, taxPercentageRaw)}" disabled>
                <small>El porcentaje de impuestos se configura en la empresa seleccionada.</small>
            </div>
            <div class="form-group">
                <label for="contract-start-date">Fecha de inicio:</label>
                <input type="date" id="contract-start-date" value="${contract?.startDate || ''}">
            </div>
            <div class="form-group">
                <label for="contract-end-date">Fecha de fin:</label>
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
                <label for="contract-description">Descripción:</label>
                <textarea id="contract-description" rows="3">${contract?.description || ''}</textarea>
            </div>
            <div id="contract-preview" style="background:#f5f5f5;padding:15px;border-radius:5px;margin-top:15px;display:none;">
                <h4>Resumen</h4>
                <p><strong>Valor del servicio:</strong> <span id="contract-preview-service">$0.00</span></p>
                <p><strong>Impuestos:</strong> <span id="contract-preview-tax">$0.00</span> (${this.utils.formatPercentage(taxPercentage, taxPercentageRaw)})</p>
                <p><strong>Valor total:</strong> <span id="contract-preview-total">$0.00</span></p>
                <p><strong>% salario:</strong> <span id="contract-preview-salary-rate">0%</span></p>
            </div>
        `;

        modal.show({ title, body: form, onSave: () => this.saveContract(contract?.id) });

        const serviceInput = document.getElementById('contract-service-value');
        const salaryInput = document.getElementById('contract-salary-percentage');
        const preview = document.getElementById('contract-preview');
        const updatePreview = () => {
            const serviceValue = this.utils.toNumber(serviceInput.value);
            const salary = this.utils.parsePercentageInput(salaryInput.value);
            preview.style.display = serviceValue > 0 ? 'block' : 'none';
            document.getElementById('contract-preview-service').textContent = this.utils.formatCurrency(serviceValue);
            document.getElementById('contract-preview-tax').textContent = this.utils.formatCurrency(this.utils.calculateTaxAmount(serviceValue, taxPercentage));
            document.getElementById('contract-preview-total').textContent = this.utils.formatCurrency(this.utils.calculateTotalWithTax(serviceValue, taxPercentage));
            document.getElementById('contract-preview-salary-rate').textContent = this.utils.formatPercentage(salary.value, salary.raw);
        };

        serviceInput?.addEventListener('input', updatePreview);
        salaryInput?.addEventListener('input', updatePreview);
        if (contract?.serviceValue) updatePreview();
    }

    async saveContract(id = null) {
        if (!this.currentCompany) {
            this.showMessage('No hay empresa seleccionada', 'error');
            return;
        }

        const salaryInput = this.utils.parsePercentageInput(document.getElementById('contract-salary-percentage').value);
        const contract = {
            code: document.getElementById('contract-code').value.trim(),
            name: document.getElementById('contract-name').value.trim(),
            client: document.getElementById('contract-client').value.trim(),
            serviceValue: this.utils.toNumber(document.getElementById('contract-service-value').value),
            salaryPercentage: salaryInput.value,
            salaryPercentageRaw: salaryInput.raw,
            taxPercentage: this.getCompanyTaxPercentage(),
            taxPercentageRaw: this.currentCompany.taxPercentageRaw ?? String(this.currentCompany.taxPercentage ?? ''),
            startDate: document.getElementById('contract-start-date').value,
            endDate: document.getElementById('contract-end-date').value,
            status: document.getElementById('contract-status').value,
            description: document.getElementById('contract-description').value.trim(),
            companyId: this.currentCompany.id,
            userId: auth.currentUser.id,
            createdAt: id ? undefined : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!contract.code || !contract.name || !contract.client) {
            this.showMessage('El código, nombre y cliente son requeridos', 'error');
            return;
        }
        if (contract.serviceValue <= 0) {
            this.showMessage('El valor del servicio debe ser mayor a 0', 'error');
            return;
        }
        if (contract.salaryPercentage < 0 || contract.salaryPercentage > 100) {
            this.showMessage('El porcentaje de salario debe estar entre 0 y 100', 'error');
            return;
        }

        try {
            if (id) {
                const existingContract = await db.get('contracts', id);
                if (!existingContract) {
                    this.showMessage('Contrato no encontrado', 'error');
                    return;
                }
                contract.createdAt = existingContract.createdAt;
                await db.update('contracts', id, contract);
                this.showMessage('Contrato actualizado exitosamente', 'success');
            } else {
                await db.add('contracts', contract);
                this.showMessage('Contrato creado exitosamente', 'success');
            }

            modal.hide();
            await this.loadContracts();
            await certifications?.loadCertifications?.();
            await invoices?.loadInvoices?.();
            await salary?.updateSalarySummary?.();

            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: this.currentCompany.id,
                type: id ? 'contract_update' : 'contract_create',
                description: `${id ? 'Actualizado' : 'Creado'} contrato ${contract.code} - ${contract.name}`
            });
        } catch (error) {
            console.error('Error al guardar contrato:', error);
            this.showMessage(`Error al guardar el contrato: ${error.message}`, 'error');
        }
    }

    async editContract(id) {
        const contract = await db.get('contracts', id);
        if (contract) {
            this.showContractForm(contract);
        } else {
            this.showMessage('Contrato no encontrado', 'error');
        }
    }

    async showSupplementForm(contractId) {
        const contract = await db.get('contracts', contractId);
        if (!contract) {
            this.showMessage('Contrato no encontrado', 'error');
            return;
        }

        const form = `
            <div class="form-group">
                <label for="supplement-amount">Monto suplemento ($) *:</label>
                <input type="number" id="supplement-amount" step="0.01" min="0.01" required>
            </div>
            <div class="form-group">
                <label for="supplement-date">Fecha *:</label>
                <input type="date" id="supplement-date" value="${new Date().toISOString().split('T')[0]}" required>
            </div>
            <div class="form-group">
                <label for="supplement-description">Descripción:</label>
                <textarea id="supplement-description" rows="3" placeholder="Motivo o detalle del suplemento"></textarea>
            </div>
            <div style="background:#f5f5f5;padding:12px;border-radius:6px;">
                <p><strong>Contrato:</strong> ${contract.code} - ${contract.name || 'Sin nombre'}</p>
                <p><strong>Valor base:</strong> ${this.utils.formatCurrency(contract.serviceValue)}</p>
            </div>
        `;

        modal.show({
            title: `Nuevo suplemento - ${contract.code}`,
            body: form,
            onSave: () => this.saveSupplement(contractId)
        });
    }

    async saveSupplement(contractId) {
        const amount = this.utils.toNumber(document.getElementById('supplement-amount').value);
        const date = document.getElementById('supplement-date').value;
        const description = document.getElementById('supplement-description').value.trim();

        if (amount <= 0 || !date) {
            this.showMessage('Completa correctamente el suplemento', 'error');
            return;
        }

        try {
            const contract = await db.get('contracts', contractId);
            if (!contract) {
                this.showMessage('Contrato no encontrado', 'error');
                return;
            }

            const supplements = Array.isArray(contract.supplements) ? [...contract.supplements] : [];
            supplements.push({
                id: `sup_${Date.now()}`,
                amount,
                date,
                description
            });

            await db.update('contracts', contractId, {
                ...contract,
                supplements,
                updatedAt: new Date().toISOString()
            });

            modal.hide();
            this.showMessage('Suplemento agregado exitosamente', 'success');
            await this.loadContracts();
            await certifications?.loadCertifications?.();
            await invoices?.loadInvoices?.();
            await salary?.updateSalarySummary?.();
        } catch (error) {
            console.error('Error al guardar suplemento:', error);
            this.showMessage(`Error al guardar el suplemento: ${error.message}`, 'error');
        }
    }

    async deleteContract(id) {
        if (!confirm('¿Estás seguro de eliminar este contrato? También se eliminarán certificaciones, facturas y pagos asociados.')) {
            return;
        }

        try {
            const [certificationsList, invoicesList, paymentsList] = await Promise.all([
                db.getAll('certifications', 'contractId', id),
                db.getAll('invoices', 'contractId', id),
                db.getAll('payments', 'contractId', id)
            ]);

            for (const cert of certificationsList) await db.delete('certifications', cert.id);
            for (const invoice of invoicesList) await db.delete('invoices', invoice.id);
            for (const payment of paymentsList) await db.delete('payments', payment.id);
            await db.delete('contracts', id);

            this.showMessage('Contrato eliminado exitosamente', 'success');
            await this.loadContracts();
            await certifications?.loadCertifications?.();
            await invoices?.loadInvoices?.();
            await payments?.loadPayments?.();
            await salary?.updateSalarySummary?.();
        } catch (error) {
            console.error('Error al eliminar contrato:', error);
            this.showMessage('Error al eliminar el contrato', 'error');
        }
    }

    updateCompanyUI() {
        const element = document.getElementById('current-company');
        if (element && this.currentCompany) {
            element.textContent = `${this.currentCompany.name} · Impuesto ${this.utils.formatPercentage(this.getCompanyTaxPercentage(), this.currentCompany.taxPercentageRaw)}`;
        }
    }

    updateDashboard(contracts = []) {
        const activeContracts = contracts.filter(contract => (contract.status || 'activo') === 'activo').length;
        const activeContractsElement = document.getElementById('active-contracts');
        if (activeContractsElement) {
            activeContractsElement.textContent = activeContracts;
        }
    }

    showMessage(message, type) {
        if (window.auth?.showMessage) {
            auth.showMessage(message, type);
        } else {
            alert(message);
        }
    }
}

let contracts;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    contracts = new Contracts();
    window.contracts = contracts;
});
