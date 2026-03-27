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

    getContractTypeLabel(type) {
        return type === 'supplement' ? 'Suplemento' : 'Contrato';
    }

    getContractScopeOptions(contract) {
        const options = [{
            id: `contract:${contract.id}`,
            label: `${contract.code} · Contrato base`,
            amount: this.utils.toNumber(contract.serviceValue),
            type: 'contract'
        }];
        const supplements = Array.isArray(contract.supplements) ? contract.supplements : [];
        supplements.forEach((supplement, index) => {
            options.push({
                id: `supplement:${supplement.id}`,
                label: `${contract.code} · SUP-${String(index + 1).padStart(2, '0')} (${supplement.date || 's/f'})`,
                amount: this.utils.toNumber(supplement.amount),
                type: 'supplement',
                supplement
            });
        });
        return options;
    }

    async buildFinancialByScope(contract) {
        const companyId = this.currentCompany?.id;
        const [certificationsList] = await Promise.all([
            db.getAll('certifications', 'companyId', companyId)
        ]);
        const companyTax = this.getCompanyTaxPercentage();
        const scopes = this.getContractScopeOptions(contract);
        return scopes.map(scope => {
            const certified = certificationsList
                .filter(cert => cert.contractId === contract.id && (cert.scopeId || `contract:${contract.id}`) === scope.id)
                .reduce((sum, cert) => sum + this.utils.toNumber(cert.amount), 0);
            const totalWithTax = this.utils.calculateTotalWithTax(scope.amount, companyTax);
            const certifiedWithTax = this.utils.calculateTotalWithTax(certified, companyTax);
            const pendingWithTax = Math.max(0, totalWithTax - certifiedWithTax);
            return { ...scope, certified, totalWithTax, certifiedWithTax, pendingWithTax };
        });
    }

    async loadContracts() {
        if (!this.currentCompany || !auth?.currentUser) {
            this.renderContracts([]);
            this.updateDashboard([]);
            return;
        }

        try {
            const contracts = await db.getAll('contracts', 'companyId', this.currentCompany.id);
            const enriched = await Promise.all(contracts.map(async (contract) => {
                const scopes = await this.buildFinancialByScope(contract);
                const pending = scopes.reduce((sum, scope) => sum + scope.pendingWithTax, 0);
                const computedStatus = pending <= 0 ? 'finalizado' : ((contract.status === 'suspendido') ? 'suspendido' : 'activo');
                if (computedStatus !== (contract.status || 'activo')) {
                    await db.update('contracts', contract.id, { ...contract, status: computedStatus, updatedAt: new Date().toISOString() });
                }
                return { ...contract, status: computedStatus, scopes };
            }));
            this.renderContracts(enriched);
            this.updateDashboard(enriched);
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
                    <td colspan="10" style="text-align: center; padding: 20px;">
                        No hay contratos registrados. Haz clic en "Nuevo Contrato" para agregar uno.
                    </td>
                </tr>
            `;
            return;
        }

        contracts.forEach(contract => {
            const scopes = contract.scopes || [];
            const totalPending = scopes.reduce((sum, scope) => sum + scope.pendingWithTax, 0);
            const status = totalPending <= 0 ? 'finalizado' : ((contract.status === 'suspendido') ? 'suspendido' : 'activo');
            const details = scopes.map(scope => `${scope.label}: Pendiente ${this.utils.formatCurrency(scope.pendingWithTax)}`).join('<br>');
            const canAddSupplement = (contract.contractType || 'contract') === 'contract';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${contract.code || 'N/A'}</td>
                <td>${contract.name || 'Sin nombre'}</td>
                <td>${this.getContractTypeLabel(contract.contractType)}</td>
                <td>${contract.client || 'N/A'}</td>
                <td>${this.utils.formatCurrency(this.utils.toNumber(contract.serviceValue))}</td>
                <td>${this.utils.formatCurrency(scopes.reduce((sum, scope) => sum + scope.totalWithTax, 0))}</td>
                <td>${this.utils.formatPercentage(this.utils.toNumber(contract.salaryPercentage), contract.salaryPercentageRaw)}</td>
                <td>${this.utils.formatCurrency(totalPending)}<br><small>${details}</small></td>
                <td><span class="status ${status}">${status}</span></td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="contracts.editContract('${contract.id}')"><i class="fas fa-edit"></i></button>
                    ${canAddSupplement ? `<button class="btn btn-sm btn-primary" onclick="contracts.showSupplementForm('${contract.id}')"><i class="fas fa-file-circle-plus"></i></button>` : ''}
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
        const isSupplement = (contract?.contractType || 'contract') === 'supplement';
        const contractTypeControl = contract
            ? `<div class="form-group"><label>Tipo:</label><input type="text" value="${this.getContractTypeLabel(contract.contractType)}" disabled></div>`
            : `
                <div class="form-group"><label for="contract-type">Tipo *:</label><select id="contract-type"><option value="contract" selected>Contrato</option><option value="supplement">Suplemento</option></select></div>
                <div class="form-group" id="contract-parent-group" style="display:none;"><label for="contract-parent-id">Contrato base *:</label><select id="contract-parent-id"><option value="">Seleccionar contrato</option></select></div>
            `;
        const form = `
            ${contractTypeControl}
            <div class="form-group"><label for="contract-code">Código *:</label><input type="text" id="contract-code" value="${contract?.code || ''}" required></div>
            <div class="form-group"><label for="contract-name">Nombre del contrato *:</label><input type="text" id="contract-name" value="${contract?.name || ''}" required></div>
            <div class="form-group"><label for="contract-client">Cliente *:</label><input type="text" id="contract-client" value="${contract?.client || ''}" required></div>
            <div class="form-group"><label for="contract-service-value">Valor del servicio ($) *:</label><input type="number" id="contract-service-value" step="0.0000001" min="0.0000001" value="${contract?.serviceValue || ''}" required></div>
            <div class="form-group"><label for="contract-salary-percentage">% de salario *:</label><input type="number" id="contract-salary-percentage" step="0.0000001" min="0" max="100" value="${contract?.salaryPercentageRaw ?? contract?.salaryPercentage ?? ''}" required></div>
            <div class="form-group"><label>% de impuestos de la empresa:</label><input type="text" value="${this.utils.formatPercentage(taxPercentage, taxPercentageRaw)}" disabled></div>
            <div class="form-group"><label for="contract-start-date">Fecha de inicio:</label><input type="date" id="contract-start-date" value="${contract?.startDate || ''}"></div>
            <div class="form-group"><label for="contract-end-date">Fecha de fin:</label><input type="date" id="contract-end-date" value="${contract?.endDate || ''}"></div>
            <div class="form-group"><label for="contract-status">Estado:</label><select id="contract-status"><option value="activo" ${(contract?.status || 'activo') === 'activo' ? 'selected' : ''}>Activo</option><option value="finalizado" ${contract?.status === 'finalizado' ? 'selected' : ''}>Finalizado</option><option value="suspendido" ${contract?.status === 'suspendido' ? 'selected' : ''}>Suspendido</option></select></div>
            <div class="form-group"><label for="contract-description">Descripción:</label><textarea id="contract-description" rows="3">${contract?.description || ''}</textarea></div>
        `;

        modal.show({ title, body: form, onSave: () => this.saveContract(contract?.id) });

        if (!contract) {
            this.setupContractTypeSelector();
        }
        if (contract && isSupplement) {
            const status = document.getElementById('contract-status');
            if (status) status.value = contract.status || 'activo';
        }
    }

    async setupContractTypeSelector() {
        const typeSelect = document.getElementById('contract-type');
        const parentGroup = document.getElementById('contract-parent-group');
        const parentSelect = document.getElementById('contract-parent-id');
        if (!typeSelect || !parentGroup || !parentSelect) return;

        const contractsList = await db.getAll('contracts', 'companyId', this.currentCompany.id);
        const availableParents = contractsList.filter(item => (item.contractType || 'contract') === 'contract');
        parentSelect.innerHTML = `<option value="">Seleccionar contrato</option>${availableParents.map(item => `<option value="${item.id}">${item.code} - ${item.name}</option>`).join('')}`;

        const toggleParent = () => {
            const showParent = typeSelect.value === 'supplement';
            parentGroup.style.display = showParent ? 'block' : 'none';
            parentSelect.required = showParent;
        };

        typeSelect.addEventListener('change', toggleParent);
        toggleParent();
    }

    async saveContract(id = null) {
        if (!this.currentCompany) {
            this.showMessage('No hay empresa seleccionada', 'error');
            return;
        }

        const contractType = id ? null : (document.getElementById('contract-type')?.value || 'contract');
        const parentContractId = id ? null : (document.getElementById('contract-parent-id')?.value || '');
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
            contractType: contractType || undefined,
            parentContractId: parentContractId || undefined,
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
        if (!id && contractType === 'supplement' && !parentContractId) {
            this.showMessage('Selecciona el contrato base del suplemento', 'error');
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
                contract.supplements = existingContract.supplements || [];
                contract.contractType = existingContract.contractType || 'contract';
                contract.parentContractId = existingContract.parentContractId || '';
                await db.update('contracts', id, contract);
                this.showMessage('Contrato actualizado exitosamente', 'success');
            } else {
                contract.contractType = contractType;
                contract.parentContractId = parentContractId;
                await db.add('contracts', contract);
                this.showMessage(contractType === 'supplement' ? 'Suplemento creado exitosamente' : 'Contrato creado exitosamente', 'success');
            }

            modal.hide();
            await this.loadContracts();
            await certifications?.loadCertifications?.();
            await invoices?.loadInvoices?.();
            await salary?.updateSalarySummary?.();
        } catch (error) {
            console.error('Error al guardar contrato:', error);
            this.showMessage(`Error al guardar el contrato: ${error.message}`, 'error');
        }
    }

    async editContract(id) {
        const contract = await db.get('contracts', id);
        if (contract) this.showContractForm(contract);
        else this.showMessage('Contrato no encontrado', 'error');
    }

    async showSupplementForm(contractId) {
        const contract = await db.get('contracts', contractId);
        if (!contract) {
            this.showMessage('Contrato no encontrado', 'error');
            return;
        }

        const form = `
            <div class="form-group"><label for="supplement-amount">Monto suplemento ($) *:</label><input type="number" id="supplement-amount" step="0.0000001" min="0.0000001" required></div>
            <div class="form-group"><label for="supplement-date">Fecha *:</label><input type="date" id="supplement-date" value="${new Date().toISOString().split('T')[0]}" required></div>
            <div class="form-group"><label for="supplement-description">Descripción:</label><textarea id="supplement-description" rows="3"></textarea></div>
        `;

        modal.show({ title: `Nuevo suplemento - ${contract.code}`, body: form, onSave: () => this.saveSupplement(contractId) });
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
            supplements.push({ id: `sup_${Date.now()}`, amount, date, description });

            await db.update('contracts', contractId, { ...contract, supplements, updatedAt: new Date().toISOString() });
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
        if (!confirm('¿Estás seguro de eliminar este contrato? También se eliminarán certificaciones, facturas y pagos asociados.')) return;
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
        if (activeContractsElement) activeContractsElement.textContent = activeContracts;
    }

    showMessage(message, type) {
        if (window.auth?.showMessage) auth.showMessage(message, type);
        else alert(message);
    }
}

let contracts;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    contracts = new Contracts();
    window.contracts = contracts;
});
