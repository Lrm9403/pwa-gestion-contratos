class Certifications {
    constructor() {
        this.utils = window.contractAppUtils;
        this.init();
    }

    init() {
        document.getElementById('add-certification')?.addEventListener('click', () => this.showCertificationForm());
        document.addEventListener('companyChanged', () => this.loadCertifications());
    }

    getTodayPeriod() {
        const now = new Date();
        return { month: now.getMonth() + 1, year: now.getFullYear() };
    }

    isFuturePeriod(month, year) {
        const today = this.getTodayPeriod();
        return year > today.year || (year === today.year && month > today.month);
    }

    async getCompanyContractsData() {
        const companyId = companies?.currentCompany?.id;
        const [contractsList, certificationsList, paymentsList, invoicesList] = await Promise.all([
            db.getAll('contracts', 'companyId', companyId),
            db.getAll('certifications', 'companyId', companyId),
            db.getAll('payments', 'companyId', companyId),
            db.getAll('invoices', 'companyId', companyId)
        ]);
        return { contractsList, certificationsList, paymentsList, invoicesList };
    }

    async syncCertificationStatuses() {
        const { certificationsList, invoicesList, paymentsList } = await this.getCompanyContractsData();
        const paidInvoiceIds = new Set();
        const invoicePaidMap = new Map();
        paymentsList.filter(p => p.purpose === 'invoice').forEach(payment => {
            (payment.allocations || []).forEach(a => {
                const current = invoicePaidMap.get(a.invoiceId) || 0;
                invoicePaidMap.set(a.invoiceId, current + this.utils.toNumber(a.amount));
            });
        });

        invoicesList.forEach(invoice => {
            const paid = invoicePaidMap.get(invoice.id) || 0;
            if ((invoice.manualStatus || invoice.status) === 'pagado' || paid >= this.utils.toNumber(invoice.amount)) {
                paidInvoiceIds.add(invoice.id);
            }
        });

        for (const cert of certificationsList) {
            const certInvoices = invoicesList.filter(inv => inv.certificationId === cert.id);
            const shouldBeApproved = certInvoices.length > 0 && certInvoices.every(inv => paidInvoiceIds.has(inv.id));
            const nextStatus = shouldBeApproved ? 'aprobado' : 'pendiente';
            if (nextStatus !== cert.status) {
                await db.update('certifications', cert.id, { ...cert, status: nextStatus, updatedAt: new Date().toISOString() });
            }
        }
    }

    getSalaryPaidForCertification(certification, paymentsList) {
        return paymentsList
            .filter(payment => payment.purpose === 'salary')
            .flatMap(payment => payment.allocations || [])
            .filter(allocation => allocation.certificationId === certification.id)
            .reduce((sum, allocation) => sum + this.utils.toNumber(allocation.amount), 0);
    }

    getContractScope(contract, scopeId) {
        if (!scopeId || scopeId === `contract:${contract.id}`) {
            return { label: 'Contrato base', amount: this.utils.toNumber(contract.serviceValue) };
        }
        const supplement = (contract.supplements || []).find(item => `supplement:${item.id}` === scopeId);
        if (!supplement) return { label: 'Suplemento', amount: 0 };
        return { label: `Suplemento (${supplement.date || 's/f'})`, amount: this.utils.toNumber(supplement.amount) };
    }

    async loadCertifications() {
        if (!companies?.currentCompany || !auth?.currentUser) {
            this.renderCertifications([]);
            return;
        }

        try {
            await this.syncCertificationStatuses();
            const { contractsList, certificationsList, paymentsList } = await this.getCompanyContractsData();
            const companyTax = this.utils.getCompanyTaxPercentage(companies.currentCompany);

            const enrichedCerts = certificationsList.map(certification => {
                const contract = contractsList.find(contractItem => contractItem.id === certification.contractId);
                const scopeId = certification.scopeId || `contract:${certification.contractId}`;
                const scope = contract ? this.getContractScope(contract, scopeId) : { label: 'N/A', amount: 0 };
                const sameScopeCerts = certificationsList
                    .filter(item => item.contractId === certification.contractId && (item.scopeId || `contract:${item.contractId}`) === scopeId)
                    .sort((a, b) => this.utils.comparePeriods(a, b));
                const certifiedToDate = sameScopeCerts
                    .filter(item => this.utils.comparePeriods(item, certification) <= 0)
                    .reduce((sum, item) => sum + this.utils.calculateTotalWithTax(item.amount, companyTax), 0);

                const salaryGenerated = this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0);
                const salaryPaid = this.getSalaryPaidForCertification(certification, paymentsList);
                const salaryPending = Math.max(0, salaryGenerated - salaryPaid);
                const certifiedWithTax = this.utils.calculateTotalWithTax(certification.amount, companyTax);
                const scopeTotal = this.utils.calculateTotalWithTax(scope.amount, companyTax);
                const pendingScopeAmount = Math.max(0, scopeTotal - certifiedToDate);

                return {
                    ...certification,
                    scopeId,
                    scopeLabel: scope.label,
                    contractCode: contract?.code || 'N/A',
                    contractName: contract?.name || 'Sin nombre',
                    contractClient: contract?.client || 'N/A',
                    contractTotal: scopeTotal,
                    certifiedWithTax,
                    pendingContractAmount: pendingScopeAmount,
                    salaryPercentage: this.utils.toNumber(contract?.salaryPercentage),
                    salaryGenerated,
                    salaryPaid,
                    salaryPending,
                    statusLabel: certification.status || 'pendiente'
                };
            }).sort((a, b) => this.utils.comparePeriods(b, a));

            this.renderCertifications(enrichedCerts);
        } catch (error) {
            console.error('Error al cargar certificaciones:', error);
            this.showMessage('Error al cargar certificaciones', 'error');
        }
    }

    renderCertifications(certifications) {
        const tbody = document.getElementById('certifications-list');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (certifications.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">No hay certificaciones registradas. Haz clic en "Nueva Certificación" para agregar una.</td></tr>`;
            return;
        }

        certifications.forEach(cert => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${cert.contractCode} - ${cert.contractName}<br><small>${cert.contractClient}</small><br><small>${cert.scopeLabel}</small></td>
                <td>${this.getMonthName(cert.month)}/${cert.year}</td>
                <td>${this.utils.formatCurrency(cert.amount)}</td>
                <td>${this.utils.formatCurrency(cert.certifiedWithTax)}<br><small>Pendiente alcance: ${this.utils.formatCurrency(cert.pendingContractAmount)}</small></td>
                <td>${this.utils.formatCurrency(cert.salaryGenerated)}<br><small>Pagado: ${this.utils.formatCurrency(cert.salaryPaid)} · Pendiente: ${this.utils.formatCurrency(cert.salaryPending)}</small></td>
                <td><span class="status ${cert.statusLabel}">${cert.statusLabel}</span></td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="certifications.editCertification('${cert.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="certifications.deleteCertification('${cert.id}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    getMonthName(month) {
        return ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][month - 1] || month;
    }

    async showCertificationForm(certification = null) {
        if (!companies?.currentCompany) {
            this.showMessage('Primero selecciona una empresa', 'error');
            return;
        }

        const contractsList = await db.getAll('contracts', 'companyId', companies.currentCompany.id);
        const activeContracts = contractsList.filter(contract => (contract.status || 'activo') !== 'suspendido');
        if (activeContracts.length === 0) {
            this.showMessage('No hay contratos para crear certificaciones', 'error');
            return;
        }

        const scopeOptions = activeContracts.flatMap(contract => {
            const base = [{ value: `contract:${contract.id}`, contractId: contract.id, salary: contract.salaryPercentage, label: `${contract.code} - ${contract.name} (Contrato base)` }];
            const supplements = (contract.supplements || []).map((supp, index) => ({
                value: `supplement:${supp.id}`,
                contractId: contract.id,
                salary: contract.salaryPercentage,
                label: `${contract.code} - ${contract.name} (SUP-${String(index + 1).padStart(2, '0')} · ${supp.date || 's/f'})`
            }));
            return [...base, ...supplements];
        });

        const selectedScope = certification?.scopeId || `contract:${certification?.contractId || ''}`;

        const form = `
            <div class="form-group"><label for="cert-scope">Contrato/Suplemento *:</label><select id="cert-scope" required><option value="">Seleccionar</option>${scopeOptions.map(o => `<option value="${o.value}" data-contract-id="${o.contractId}" data-salary="${o.salary}" ${selectedScope === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select></div>
            <div class="form-group"><label for="cert-month">Mes *:</label><select id="cert-month" required><option value="">Seleccionar mes</option>${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}" ${certification?.month === index + 1 ? 'selected' : ''}>${['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][index]}</option>`).join('')}</select></div>
            <div class="form-group"><label for="cert-year">Año *:</label><input type="number" id="cert-year" min="2020" max="2100" value="${certification?.year || new Date().getFullYear()}" required></div>
            <div class="form-group"><label for="cert-amount">Monto certificado ($) *:</label><input type="number" id="cert-amount" step="0.0000001" min="0.0000001" value="${certification?.amount || ''}" required></div>
            <div class="form-group"><label for="cert-status">Estado:</label><select id="cert-status"><option value="pendiente" ${(certification?.status || 'pendiente') === 'pendiente' ? 'selected' : ''}>Pendiente</option><option value="aprobado" ${certification?.status === 'aprobado' ? 'selected' : ''}>Aprobado</option></select></div>
            <div class="form-group"><label for="cert-notes">Notas:</label><textarea id="cert-notes" rows="3">${certification?.notes || ''}</textarea></div>
        `;

        modal.show({ title: certification ? 'Editar Certificación' : 'Nueva Certificación', body: form, onSave: () => this.saveCertification(certification?.id) });
    }

    async saveCertification(id = null) {
        const scopeSelect = document.getElementById('cert-scope');
        const scopeId = scopeSelect.value;
        const contractId = scopeSelect.selectedOptions[0]?.dataset.contractId || '';
        const month = Number.parseInt(document.getElementById('cert-month').value, 10);
        const year = Number.parseInt(document.getElementById('cert-year').value, 10);
        const amount = this.utils.toNumber(document.getElementById('cert-amount').value);
        const status = document.getElementById('cert-status').value;
        const notes = document.getElementById('cert-notes').value.trim();

        if (!scopeId || !contractId || !month || !year || amount <= 0) {
            this.showMessage('Completa todos los campos requeridos correctamente', 'error');
            return;
        }
        if (this.isFuturePeriod(month, year)) {
            this.showMessage('No puedes registrar certificaciones de meses futuros', 'error');
            return;
        }

        try {
            const contract = await db.get('contracts', contractId);
            if (!contract) {
                this.showMessage('Contrato no encontrado', 'error');
                return;
            }

            const existingCerts = await db.getAll('certifications', 'companyId', companies.currentCompany.id);
            const duplicate = existingCerts.find(item => item.id !== id && item.contractId === contractId && (item.scopeId || `contract:${item.contractId}`) === scopeId && item.month === month && item.year === year);
            if (duplicate) {
                this.showMessage(`Ya existe una certificación para ${month}/${year} en este contrato/suplemento`, 'error');
                return;
            }

            const certification = {
                contractId,
                scopeId,
                month,
                year,
                amount,
                salaryPercentage: this.utils.toNumber(contract.salaryPercentage),
                taxPercentage: this.utils.getCompanyTaxPercentage(companies.currentCompany),
                status,
                notes,
                companyId: companies.currentCompany.id,
                userId: auth.currentUser.id,
                createdAt: id ? undefined : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (id) {
                const existing = await db.get('certifications', id);
                if (!existing) {
                    this.showMessage('Certificación no encontrada', 'error');
                    return;
                }
                certification.createdAt = existing.createdAt;
                await db.update('certifications', id, certification);
                this.showMessage('Certificación actualizada exitosamente', 'success');
            } else {
                await db.add('certifications', certification);
                this.showMessage('Certificación creada exitosamente', 'success');
            }

            modal.hide();
            await this.loadCertifications();
            await invoices?.loadInvoices?.();
            await payments?.loadPayments?.();
            await salary?.updateSalarySummary?.();
        } catch (error) {
            console.error('Error al guardar certificación:', error);
            this.showMessage(`Error al guardar la certificación: ${error.message}`, 'error');
        }
    }

    async editCertification(id) {
        const certification = await db.get('certifications', id);
        if (certification) this.showCertificationForm(certification);
        else this.showMessage('Certificación no encontrada', 'error');
    }

    async deleteCertification(id) {
        if (!confirm('¿Estás seguro de eliminar esta certificación?')) return;

        try {
            const paymentsList = await db.getAll('payments', 'companyId', companies.currentCompany.id);
            const certificationPayments = paymentsList.filter(payment => (payment.allocations || []).some(allocation => allocation.certificationId === id));
            for (const payment of certificationPayments) await db.delete('payments', payment.id);

            const invoicesList = await db.getAll('invoices', 'companyId', companies.currentCompany.id);
            const certificationInvoices = invoicesList.filter(invoice => invoice.certificationId === id);
            for (const invoice of certificationInvoices) await db.delete('invoices', invoice.id);

            await db.delete('certifications', id);
            this.showMessage('Certificación eliminada exitosamente', 'success');
            await this.loadCertifications();
            await invoices?.loadInvoices?.();
            await payments?.loadPayments?.();
            await salary?.updateSalarySummary?.();
        } catch (error) {
            console.error('Error al eliminar certificación:', error);
            this.showMessage('Error al eliminar la certificación', 'error');
        }
    }

    showMessage(message, type) {
        if (window.auth?.showMessage) auth.showMessage(message, type);
        else alert(message);
    }
}

let certifications;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    certifications = new Certifications();
    window.certifications = certifications;
});
