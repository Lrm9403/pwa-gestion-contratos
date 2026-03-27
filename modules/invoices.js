class Invoices {
    constructor() {
        this.utils = window.contractAppUtils;
        this.init();
    }

    init() {
        document.getElementById('add-invoice')?.addEventListener('click', () => this.showInvoiceForm());
        document.addEventListener('companyChanged', () => this.loadInvoices());
    }

    getInvoicePaidAmount(invoice, paymentsList) {
        return paymentsList
            .filter(payment => payment.purpose === 'invoice')
            .flatMap(payment => payment.allocations || [])
            .filter(allocation => allocation.invoiceId === invoice.id)
            .reduce((sum, allocation) => sum + this.utils.toNumber(allocation.amount), 0);
    }

    getInvoiceStatus(invoice, paidAmount) {
        const amount = this.utils.toNumber(invoice.amount);
        if (invoice.manualStatus === 'pagado') return 'pagado';
        if (paidAmount <= 0) return 'por_pagar';
        if (paidAmount >= amount) return 'pagado';
        return 'parcial';
    }

    isFutureDate(rawDate) {
        if (!rawDate) return false;
        const selected = new Date(`${rawDate}T00:00:00`);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return selected > today;
    }

    getNextInvoiceNumber(existingInvoices) {
        const year = new Date().getFullYear().toString().slice(-2);
        const regex = new RegExp(`^F\\s*(\\d{1,4})\\/${year}$`, 'i');
        const max = existingInvoices.reduce((acc, invoice) => {
            const match = String(invoice.number || '').match(regex);
            const seq = match ? Number.parseInt(match[1], 10) : 0;
            return Math.max(acc, seq);
        }, 0);
        return `F ${String(max + 1).padStart(2, '0')}/${year}`;
    }

    async syncCertificationStatusFromInvoices() {
        const [certificationsList, invoicesList, paymentsList] = await Promise.all([
            db.getAll('certifications', 'companyId', companies.currentCompany.id),
            db.getAll('invoices', 'companyId', companies.currentCompany.id),
            db.getAll('payments', 'companyId', companies.currentCompany.id)
        ]);

        const paidMap = new Map();
        paymentsList.filter(p => p.purpose === 'invoice').forEach(payment => {
            (payment.allocations || []).forEach(a => paidMap.set(a.invoiceId, (paidMap.get(a.invoiceId) || 0) + this.utils.toNumber(a.amount)));
        });

        for (const cert of certificationsList) {
            const certInvoices = invoicesList.filter(inv => inv.certificationId === cert.id);
            if (certInvoices.length === 0) continue;
            const approved = certInvoices.every(inv => (inv.manualStatus === 'pagado') || ((paidMap.get(inv.id) || 0) >= this.utils.toNumber(inv.amount)));
            const newStatus = approved ? 'aprobado' : 'pendiente';
            if (newStatus !== cert.status) {
                await db.update('certifications', cert.id, { ...cert, status: newStatus, updatedAt: new Date().toISOString() });
            }
        }
    }

    async loadInvoices() {
        if (!companies?.currentCompany || !auth?.currentUser) {
            this.renderInvoices([]);
            return;
        }

        try {
            await this.syncCertificationStatusFromInvoices();
            const [invoicesList, contractsList, certificationsList, paymentsList] = await Promise.all([
                db.getAll('invoices', 'companyId', companies.currentCompany.id),
                db.getAll('contracts', 'companyId', companies.currentCompany.id),
                db.getAll('certifications', 'companyId', companies.currentCompany.id),
                db.getAll('payments', 'companyId', companies.currentCompany.id)
            ]);

            const enrichedInvoices = invoicesList.map(invoice => {
                const contract = contractsList.find(item => item.id === invoice.contractId);
                const certification = certificationsList.find(item => item.id === invoice.certificationId);
                const paidAmount = this.getInvoicePaidAmount(invoice, paymentsList);
                const pendingAmount = Math.max(0, this.utils.toNumber(invoice.amount) - paidAmount);
                return {
                    ...invoice,
                    contractCode: contract?.code || 'N/A',
                    contractName: contract?.name || 'Sin nombre',
                    contractClient: contract?.client || 'N/A',
                    certificationLabel: certification ? this.utils.getCertificationPeriodLabel(certification) : 'Sin certificación',
                    scopeLabel: certification?.scopeId?.startsWith('supplement:') ? 'Suplemento' : 'Contrato base',
                    paidAmount,
                    pendingAmount,
                    computedStatus: this.getInvoiceStatus(invoice, paidAmount)
                };
            }).sort((a, b) => new Date(b.date) - new Date(a.date));

            this.renderInvoices(enrichedInvoices);
        } catch (error) {
            console.error('Error al cargar facturas:', error);
            this.showMessage('Error al cargar facturas', 'error');
        }
    }

    renderInvoices(invoices) {
        const tbody = document.getElementById('invoices-list');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (invoices.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">No hay facturas registradas. Haz clic en "Nueva Factura" para agregar una.</td></tr>`;
            return;
        }

        invoices.forEach(invoice => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${invoice.number || 'N/A'}</td>
                <td>${invoice.contractCode} - ${invoice.contractName}<br><small>${invoice.contractClient}</small><br><small>${invoice.certificationLabel} · ${invoice.scopeLabel}</small></td>
                <td>${new Date(invoice.date).toLocaleDateString('es-ES')}</td>
                <td>${this.utils.formatCurrency(invoice.amount)}<br><small>Pagado: ${this.utils.formatCurrency(invoice.paidAmount)} · Pendiente: ${this.utils.formatCurrency(invoice.pendingAmount)}</small></td>
                <td><span class="status ${invoice.computedStatus}">${invoice.computedStatus}</span></td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="invoices.editInvoice('${invoice.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="invoices.deleteInvoice('${invoice.id}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    async showInvoiceForm(invoice = null) {
        if (!companies?.currentCompany) {
            this.showMessage('Primero selecciona una empresa', 'error');
            return;
        }

        const [contractsList, certificationsList, invoicesList] = await Promise.all([
            db.getAll('contracts', 'companyId', companies.currentCompany.id),
            db.getAll('certifications', 'companyId', companies.currentCompany.id),
            db.getAll('invoices', 'companyId', companies.currentCompany.id)
        ]);

        const activeContracts = contractsList.filter(contract => (contract.status || 'activo') !== 'suspendido');
        if (activeContracts.length === 0) {
            this.showMessage('No hay contratos para crear facturas', 'error');
            return;
        }

        const contractOptions = activeContracts.map(contract => `<option value="${contract.id}" ${invoice?.contractId === contract.id ? 'selected' : ''}>${contract.code} - ${contract.name}</option>`).join('');
        const takenCertIds = new Set(invoicesList.filter(item => item.id !== invoice?.id && item.certificationId).map(item => item.certificationId));

        const form = `
            <div class="form-group"><label for="invoice-number">Número de factura *:</label><input type="text" id="invoice-number" value="${invoice?.number || this.getNextInvoiceNumber(invoicesList)}" required><small>Formato sugerido: F 01/${new Date().getFullYear().toString().slice(-2)} (editable).</small></div>
            <div class="form-group"><label for="invoice-contract">Contrato *:</label><select id="invoice-contract" required><option value="">Seleccionar contrato</option>${contractOptions}</select></div>
            <div class="form-group"><label for="invoice-certification">Certificación relacionada:</label><select id="invoice-certification"><option value="">Sin certificación específica</option></select><small>Solo se muestran certificaciones del contrato/suplemento elegido y sin factura previa.</small></div>
            <div class="form-group"><label for="invoice-date">Fecha *:</label><input type="date" id="invoice-date" value="${invoice?.date || new Date().toISOString().split('T')[0]}" required></div>
            <div class="form-group"><label for="invoice-due-date">Fecha de vencimiento:</label><input type="date" id="invoice-due-date" value="${invoice?.dueDate || ''}"></div>
            <div class="form-group"><label for="invoice-amount">Monto de factura ($) *:</label><input type="number" id="invoice-amount" step="0.0000001" min="0.0000001" value="${invoice?.amount || ''}" required></div>
            <div class="form-group"><label for="invoice-manual-status">¿Factura pagada al registrar? *:</label><select id="invoice-manual-status"><option value="por_pagar" ${(invoice?.manualStatus || 'por_pagar') === 'por_pagar' ? 'selected' : ''}>No, por pagar</option><option value="pagado" ${invoice?.manualStatus === 'pagado' ? 'selected' : ''}>Sí, pagada</option></select></div>
            <div class="form-group"><label for="invoice-notes">Notas:</label><textarea id="invoice-notes" rows="3">${invoice?.notes || ''}</textarea></div>
        `;

        modal.show({ title: invoice ? 'Editar Factura' : 'Nueva Factura', body: form, onSave: () => this.saveInvoice(invoice?.id) });

        const contractSelect = document.getElementById('invoice-contract');
        const certificationSelect = document.getElementById('invoice-certification');
        const amountInput = document.getElementById('invoice-amount');
        const companyTax = this.utils.getCompanyTaxPercentage(companies.currentCompany);

        const renderCertificationOptions = () => {
            const selectedContractId = contractSelect.value;
            const availableCerts = certificationsList
                .filter(cert => cert.contractId === selectedContractId)
                .filter(cert => cert.id === invoice?.certificationId || !takenCertIds.has(cert.id))
                .sort((a, b) => this.utils.comparePeriods(a, b));

            certificationSelect.innerHTML = '<option value="">Sin certificación específica</option>';
            availableCerts.forEach(cert => {
                const option = document.createElement('option');
                option.value = cert.id;
                option.dataset.contractId = cert.contractId;
                option.dataset.amount = this.utils.calculateTotalWithTax(cert.amount, companyTax);
                option.textContent = `${this.utils.getCertificationPeriodLabel(cert)} · ${(cert.scopeId || '').startsWith('supplement:') ? 'Suplemento' : 'Contrato base'}`;
                if (invoice?.certificationId === cert.id) option.selected = true;
                certificationSelect.appendChild(option);
            });
        };

        contractSelect.addEventListener('change', renderCertificationOptions);
        certificationSelect.addEventListener('change', () => {
            const selectedOption = certificationSelect.selectedOptions[0];
            if (!selectedOption?.value) return;
            if (!amountInput.value) amountInput.value = String(selectedOption.dataset.amount || '');
        });
        renderCertificationOptions();
    }

    async saveInvoice(id = null) {
        const number = document.getElementById('invoice-number').value.trim();
        const contractId = document.getElementById('invoice-contract').value;
        const certificationId = document.getElementById('invoice-certification').value || null;
        const date = document.getElementById('invoice-date').value;
        const dueDate = document.getElementById('invoice-due-date').value || '';
        const amount = this.utils.toNumber(document.getElementById('invoice-amount').value);
        const manualStatus = document.getElementById('invoice-manual-status').value;
        const notes = document.getElementById('invoice-notes').value.trim();

        if (!number || !contractId || !date || amount <= 0) {
            this.showMessage('Completa los campos requeridos de la factura', 'error');
            return;
        }
        if (this.isFutureDate(date)) {
            this.showMessage('No puedes crear facturas con fecha futura', 'error');
            return;
        }

        const invoice = {
            number,
            contractId,
            certificationId,
            date,
            dueDate,
            amount,
            status: manualStatus,
            manualStatus,
            notes,
            companyId: companies.currentCompany.id,
            userId: auth.currentUser.id,
            createdAt: id ? undefined : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        try {
            const existingInvoices = await db.getAll('invoices', 'companyId', companies.currentCompany.id);
            const duplicate = existingInvoices.find(item => item.id !== id && item.number === number);
            if (duplicate) {
                this.showMessage('Ya existe una factura con ese número', 'error');
                return;
            }

            if (id) {
                const existing = await db.get('invoices', id);
                invoice.createdAt = existing.createdAt;
                await db.update('invoices', id, invoice);
                this.showMessage('Factura actualizada exitosamente', 'success');
            } else {
                await db.add('invoices', invoice);
                this.showMessage('Factura creada exitosamente', 'success');
            }

            await this.syncCertificationStatusFromInvoices();
            modal.hide();
            await this.loadInvoices();
            await certifications?.loadCertifications?.();
            await payments?.loadPayments?.();
        } catch (error) {
            console.error('Error al guardar factura:', error);
            this.showMessage(`Error al guardar la factura: ${error.message}`, 'error');
        }
    }

    async editInvoice(id) {
        const invoice = await db.get('invoices', id);
        if (invoice) this.showInvoiceForm(invoice);
        else this.showMessage('Factura no encontrada', 'error');
    }

    async deleteInvoice(id) {
        if (!confirm('¿Estás seguro de eliminar esta factura?')) return;

        try {
            const paymentsList = await db.getAll('payments', 'companyId', companies.currentCompany.id);
            const invoicePayments = paymentsList.filter(payment => (payment.allocations || []).some(allocation => allocation.invoiceId === id));
            for (const payment of invoicePayments) await db.delete('payments', payment.id);
            await db.delete('invoices', id);
            await this.syncCertificationStatusFromInvoices();
            this.showMessage('Factura eliminada exitosamente', 'success');
            await this.loadInvoices();
            await payments?.loadPayments?.();
            await certifications?.loadCertifications?.();
        } catch (error) {
            console.error('Error al eliminar factura:', error);
            this.showMessage('Error al eliminar la factura', 'error');
        }
    }

    showMessage(message, type) {
        if (window.auth?.showMessage) auth.showMessage(message, type);
        else alert(message);
    }
}

let invoices;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    invoices = new Invoices();
    window.invoices = invoices;
});
