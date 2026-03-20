class Payments {
    constructor() {
        this.utils = window.contractAppUtils;
        this.init();
    }

    init() {
        document.getElementById('add-payment')?.addEventListener('click', () => this.showPaymentForm());
        document.addEventListener('companyChanged', () => this.loadPayments());
    }

    async getCompanyData() {
        const companyId = companies?.currentCompany?.id;
        const [contractsList, certificationsList, invoicesList, paymentsList] = await Promise.all([
            db.getAll('contracts', 'companyId', companyId),
            db.getAll('certifications', 'companyId', companyId),
            db.getAll('invoices', 'companyId', companyId),
            db.getAll('payments', 'companyId', companyId)
        ]);
        return { contractsList, certificationsList, invoicesList, paymentsList };
    }

    getSalaryPaidMap(paymentsList) {
        const map = new Map();
        paymentsList
            .filter(payment => payment.purpose === 'salary')
            .forEach(payment => {
                (payment.allocations || []).forEach(allocation => {
                    if (!allocation.certificationId) return;
                    map.set(allocation.certificationId, this.utils.roundMoney((map.get(allocation.certificationId) || 0) + this.utils.toNumber(allocation.amount)));
                });
            });
        return map;
    }

    getInvoicePaidMap(paymentsList) {
        const map = new Map();
        paymentsList
            .filter(payment => payment.purpose === 'invoice')
            .forEach(payment => {
                (payment.allocations || []).forEach(allocation => {
                    if (!allocation.invoiceId) return;
                    map.set(allocation.invoiceId, this.utils.roundMoney((map.get(allocation.invoiceId) || 0) + this.utils.toNumber(allocation.amount)));
                });
            });
        return map;
    }

    async loadPayments() {
        if (!companies?.currentCompany || !auth?.currentUser) {
            this.renderPayments([]);
            return;
        }

        try {
            const { contractsList, certificationsList, invoicesList, paymentsList } = await this.getCompanyData();
            const enrichedPayments = paymentsList.map(payment => {
                const contract = contractsList.find(item => item.id === payment.contractId);
                const allocationLabels = (payment.allocations || []).map(allocation => {
                    if (payment.purpose === 'salary') {
                        const certification = certificationsList.find(item => item.id === allocation.certificationId);
                        return certification ? `Salario ${this.utils.getCertificationPeriodLabel(certification)} (${this.utils.formatCurrency(allocation.amount)})` : `Salario (${this.utils.formatCurrency(allocation.amount)})`;
                    }
                    const invoice = invoicesList.find(item => item.id === allocation.invoiceId);
                    return invoice ? `Factura ${invoice.number} (${this.utils.formatCurrency(allocation.amount)})` : `Factura (${this.utils.formatCurrency(allocation.amount)})`;
                });

                return {
                    ...payment,
                    contractCode: contract?.code || 'Todos',
                    contractClient: contract?.client || 'Empresa',
                    purposeLabel: payment.purpose === 'invoice' ? 'Factura' : 'Salario',
                    applicationLabel: allocationLabels.join(', ') || 'Sin aplicación',
                    paymentDate: payment.date || payment.createdAt?.split('T')[0]
                };
            }).sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

            this.renderPayments(enrichedPayments);
        } catch (error) {
            console.error('Error al cargar pagos:', error);
            this.showMessage('Error al cargar pagos', 'error');
        }
    }

    renderPayments(payments) {
        const tbody = document.getElementById('payments-list');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (payments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 20px;">
                        No hay pagos registrados. Haz clic en "Nuevo Pago" para agregar uno.
                    </td>
                </tr>
            `;
            return;
        }

        payments.forEach(payment => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(payment.paymentDate).toLocaleDateString('es-ES')}</td>
                <td>${payment.contractCode}<br><small>${payment.contractClient}</small><br><small>${payment.purposeLabel}</small></td>
                <td>${payment.applicationLabel}</td>
                <td>${this.utils.formatCurrency(payment.amount)}</td>
                <td>${this.getMethodLabel(payment.method)}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="payments.deletePayment('${payment.id}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    getMethodLabel(method) {
        return {
            transferencia: 'Transferencia',
            efectivo: 'Efectivo',
            cheque: 'Cheque',
            tarjeta: 'Tarjeta',
            otros: 'Otros'
        }[method] || method;
    }

    async showPaymentForm(payment = null) {
        if (!companies?.currentCompany) {
            this.showMessage('Primero selecciona una empresa', 'error');
            return;
        }

        const { contractsList, certificationsList, invoicesList, paymentsList } = await this.getCompanyData();
        const activeContracts = contractsList.filter(contract => (contract.status || 'activo') === 'activo');
        const salaryPaidMap = this.getSalaryPaidMap(paymentsList);
        const invoicePaidMap = this.getInvoicePaidMap(paymentsList);

        const contractOptions = activeContracts.map(contract => `
            <option value="${contract.id}" ${payment?.contractId === contract.id ? 'selected' : ''}>${contract.code} - ${contract.client}</option>
        `).join('');

        const salaryCertifications = certificationsList
            .filter(certification => {
                const contract = contractsList.find(item => item.id === certification.contractId);
                const pending = this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0) - (salaryPaidMap.get(certification.id) || 0);
                return pending > 0;
            })
            .sort((a, b) => this.utils.comparePeriods(a, b));

        const unpaidInvoices = invoicesList
            .filter(invoice => this.utils.toNumber(invoice.amount) - (invoicePaidMap.get(invoice.id) || 0) > 0)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const form = `
            <div class="form-group">
                <label for="payment-purpose">Aplicar pago a *:</label>
                <select id="payment-purpose">
                    <option value="salary" ${payment?.purpose !== 'invoice' ? 'selected' : ''}>Salarios</option>
                    <option value="invoice" ${payment?.purpose === 'invoice' ? 'selected' : ''}>Facturas</option>
                </select>
            </div>
            <div class="form-group">
                <label for="payment-mode">Modo de aplicación *:</label>
                <select id="payment-mode">
                    <option value="automatic">Automático por orden</option>
                    <option value="manual">Seleccionar registro específico</option>
                </select>
            </div>
            <div class="form-group">
                <label for="payment-contract-filter">Contrato (opcional):</label>
                <select id="payment-contract-filter">
                    <option value="">Todos los contratos</option>
                    ${contractOptions}
                </select>
            </div>
            <div class="form-group" id="payment-target-group" style="display:none;">
                <label for="payment-target">Registro específico:</label>
                <select id="payment-target"></select>
            </div>
            <div class="form-group">
                <label for="payment-amount">Monto ($) *:</label>
                <input type="number" id="payment-amount" step="0.01" min="0.01" value="${payment?.amount || ''}" required>
            </div>
            <div class="form-group">
                <label for="payment-date">Fecha *:</label>
                <input type="date" id="payment-date" value="${payment?.date || new Date().toISOString().split('T')[0]}" required>
            </div>
            <div class="form-group">
                <label for="payment-method">Método *:</label>
                <select id="payment-method" required>
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="cheque">Cheque</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="otros">Otros</option>
                </select>
            </div>
            <div class="form-group">
                <label for="payment-notes">Notas:</label>
                <textarea id="payment-notes" rows="3">${payment?.notes || ''}</textarea>
            </div>
            <div id="payment-info" style="background:#f5f5f5;padding:15px;border-radius:5px;margin-top:15px;display:block;">
                <h4>Aplicación del pago</h4>
                <p id="payment-info-summary">Selecciona el tipo de pago para ver el detalle.</p>
            </div>
        `;

        modal.show({
            title: payment ? 'Editar Pago' : 'Nuevo Pago',
            body: form,
            onSave: () => this.savePayment(payment?.id)
        });

        document.getElementById('payment-method').value = payment?.method || 'transferencia';
        const purposeSelect = document.getElementById('payment-purpose');
        const modeSelect = document.getElementById('payment-mode');
        const contractFilter = document.getElementById('payment-contract-filter');
        const targetGroup = document.getElementById('payment-target-group');
        const targetSelect = document.getElementById('payment-target');
        const infoSummary = document.getElementById('payment-info-summary');

        const renderTargets = () => {
            const purpose = purposeSelect.value;
            const selectedContractId = contractFilter.value;
            const list = purpose === 'salary'
                ? salaryCertifications.filter(item => !selectedContractId || item.contractId === selectedContractId)
                : unpaidInvoices.filter(item => !selectedContractId || item.contractId === selectedContractId);

            targetSelect.innerHTML = '';
            if (purpose === 'salary') {
                list.forEach(certification => {
                    const contract = contractsList.find(item => item.id === certification.contractId);
                    const total = this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0);
                    const paid = salaryPaidMap.get(certification.id) || 0;
                    const pending = this.utils.roundMoney(Math.max(0, total - paid));
                    const option = document.createElement('option');
                    option.value = certification.id;
                    option.textContent = `${contract?.code || 'Contrato'} · ${this.utils.getCertificationPeriodLabel(certification)} · Pendiente ${this.utils.formatCurrency(pending)}`;
                    targetSelect.appendChild(option);
                });
            } else {
                list.forEach(invoice => {
                    const paid = invoicePaidMap.get(invoice.id) || 0;
                    const pending = this.utils.roundMoney(Math.max(0, this.utils.toNumber(invoice.amount) - paid));
                    const contract = contractsList.find(item => item.id === invoice.contractId);
                    const option = document.createElement('option');
                    option.value = invoice.id;
                    option.textContent = `${invoice.number} · ${contract?.code || 'Contrato'} · Pendiente ${this.utils.formatCurrency(pending)}`;
                    targetSelect.appendChild(option);
                });
            }
            updateSummary();
        };

        const updateSummary = () => {
            const purpose = purposeSelect.value;
            const mode = modeSelect.value;
            const selectedContractId = contractFilter.value;
            if (purpose === 'salary') {
                const list = salaryCertifications.filter(item => !selectedContractId || item.contractId === selectedContractId);
                const totalPending = list.reduce((sum, certification) => {
                    const contract = contractsList.find(item => item.id === certification.contractId);
                    const total = this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0);
                    const paid = salaryPaidMap.get(certification.id) || 0;
                    return sum + Math.max(0, total - paid);
                }, 0);
                infoSummary.textContent = mode === 'manual'
                    ? 'El pago se aplicará solo a la certificación seleccionada.'
                    : `El pago se aplicará automáticamente a certificaciones por orden mensual. Pendiente total: ${this.utils.formatCurrency(totalPending)}.`;
            } else {
                const list = unpaidInvoices.filter(item => !selectedContractId || item.contractId === selectedContractId);
                const totalPending = list.reduce((sum, invoice) => sum + Math.max(0, this.utils.toNumber(invoice.amount) - (invoicePaidMap.get(invoice.id) || 0)), 0);
                infoSummary.textContent = mode === 'manual'
                    ? 'El pago se aplicará solo a la factura seleccionada.'
                    : `El pago se aplicará automáticamente a facturas por orden de fecha. Pendiente total: ${this.utils.formatCurrency(totalPending)}.`;
            }
        };

        const toggleMode = () => {
            targetGroup.style.display = modeSelect.value === 'manual' ? 'block' : 'none';
            renderTargets();
        };

        purposeSelect.addEventListener('change', toggleMode);
        modeSelect.addEventListener('change', toggleMode);
        contractFilter.addEventListener('change', renderTargets);
        toggleMode();
    }

    async savePayment(id = null) {
        const purpose = document.getElementById('payment-purpose').value;
        const mode = document.getElementById('payment-mode').value;
        const contractFilter = document.getElementById('payment-contract-filter').value || null;
        const targetId = document.getElementById('payment-target').value || null;
        const amount = this.utils.toNumber(document.getElementById('payment-amount').value);
        const date = document.getElementById('payment-date').value;
        const method = document.getElementById('payment-method').value;
        const notes = document.getElementById('payment-notes').value.trim();

        if (amount <= 0 || !date || !method) {
            this.showMessage('Completa correctamente los datos del pago', 'error');
            return;
        }

        try {
            const { contractsList, certificationsList, invoicesList, paymentsList } = await this.getCompanyData();
            const existingPayment = id ? await db.get('payments', id) : null;
            const remainingPayments = existingPayment ? paymentsList.filter(payment => payment.id !== id) : paymentsList;
            const salaryPaidMap = this.getSalaryPaidMap(remainingPayments);
            const invoicePaidMap = this.getInvoicePaidMap(remainingPayments);
            let allocations = [];
            let contractId = contractFilter;

            if (purpose === 'salary') {
                const pendingCertifications = certificationsList
                    .filter(certification => !contractFilter || certification.contractId === contractFilter)
                    .map(certification => {
                        const contract = contractsList.find(item => item.id === certification.contractId);
                        const generated = this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0);
                        const paid = salaryPaidMap.get(certification.id) || 0;
                        return {
                            certification,
                            pending: this.utils.roundMoney(Math.max(0, generated - paid))
                        };
                    })
                    .filter(item => item.pending > 0)
                    .sort((a, b) => this.utils.comparePeriods(a.certification, b.certification));

                if (mode === 'manual') {
                    const target = pendingCertifications.find(item => item.certification.id === targetId);
                    if (!target) {
                        this.showMessage('Selecciona una certificación válida', 'error');
                        return;
                    }
                    allocations = [{ certificationId: target.certification.id, amount: Math.min(amount, target.pending) }];
                    contractId = target.certification.contractId;
                } else {
                    let remaining = amount;
                    for (const item of pendingCertifications) {
                        if (remaining <= 0) break;
                        const applied = Math.min(remaining, item.pending);
                        allocations.push({ certificationId: item.certification.id, amount: applied });
                        remaining = this.utils.roundMoney(remaining - applied);
                        contractId = contractId || item.certification.contractId;
                    }
                }
            } else {
                const pendingInvoices = invoicesList
                    .filter(invoice => !contractFilter || invoice.contractId === contractFilter)
                    .map(invoice => ({
                        invoice,
                        pending: this.utils.roundMoney(Math.max(0, this.utils.toNumber(invoice.amount) - (invoicePaidMap.get(invoice.id) || 0)))
                    }))
                    .filter(item => item.pending > 0)
                    .sort((a, b) => new Date(a.invoice.date) - new Date(b.invoice.date));

                if (mode === 'manual') {
                    const target = pendingInvoices.find(item => item.invoice.id === targetId);
                    if (!target) {
                        this.showMessage('Selecciona una factura válida', 'error');
                        return;
                    }
                    allocations = [{ invoiceId: target.invoice.id, amount: Math.min(amount, target.pending) }];
                    contractId = target.invoice.contractId;
                } else {
                    let remaining = amount;
                    for (const item of pendingInvoices) {
                        if (remaining <= 0) break;
                        const applied = Math.min(remaining, item.pending);
                        allocations.push({ invoiceId: item.invoice.id, amount: applied });
                        remaining = this.utils.roundMoney(remaining - applied);
                        contractId = contractId || item.invoice.contractId;
                    }
                }
            }

            if (allocations.length === 0) {
                this.showMessage('No hay registros pendientes para aplicar este pago', 'warning');
                return;
            }

            const payment = {
                purpose,
                contractId,
                amount,
                appliedAmount: this.utils.roundMoney(allocations.reduce((sum, allocation) => sum + this.utils.toNumber(allocation.amount), 0)),
                allocations,
                date,
                method,
                notes,
                companyId: companies.currentCompany.id,
                userId: auth.currentUser.id,
                createdAt: id ? existingPayment.createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (id) {
                await db.update('payments', id, payment);
                this.showMessage('Pago actualizado exitosamente', 'success');
            } else {
                await db.add('payments', payment);
                this.showMessage('Pago registrado exitosamente', 'success');
            }

            modal.hide();
            await this.loadPayments();
            await certifications?.loadCertifications?.();
            await invoices?.loadInvoices?.();
            await salary?.updateSalarySummary?.();
        } catch (error) {
            console.error('Error al guardar pago:', error);
            this.showMessage(`Error al guardar el pago: ${error.message}`, 'error');
        }
    }

    async deletePayment(id) {
        if (!confirm('¿Estás seguro de eliminar este pago?')) return;
        try {
            await db.delete('payments', id);
            this.showMessage('Pago eliminado exitosamente', 'success');
            await this.loadPayments();
            await certifications?.loadCertifications?.();
            await invoices?.loadInvoices?.();
            await salary?.updateSalarySummary?.();
        } catch (error) {
            console.error('Error al eliminar pago:', error);
            this.showMessage('Error al eliminar el pago', 'error');
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

let payments;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    payments = new Payments();
    window.payments = payments;
});
