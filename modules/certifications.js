class Certifications {
    constructor() {
        this.utils = window.contractAppUtils;
        this.init();
    }

    init() {
        document.getElementById('add-certification')?.addEventListener('click', () => this.showCertificationForm());
        document.addEventListener('companyChanged', () => this.loadCertifications());
    }

    async getCompanyContractsData() {
        const companyId = companies?.currentCompany?.id;
        const [contractsList, certificationsList, paymentsList] = await Promise.all([
            db.getAll('contracts', 'companyId', companyId),
            db.getAll('certifications', 'companyId', companyId),
            db.getAll('payments', 'companyId', companyId)
        ]);
        return { contractsList, certificationsList, paymentsList };
    }

    getSalaryPaidForCertification(certification, paymentsList) {
        return this.utils.roundMoney(paymentsList
            .filter(payment => payment.purpose === 'salary')
            .flatMap(payment => payment.allocations || [])
            .filter(allocation => allocation.certificationId === certification.id)
            .reduce((sum, allocation) => sum + this.utils.toNumber(allocation.amount), 0));
    }

    async loadCertifications() {
        if (!companies?.currentCompany || !auth?.currentUser) {
            this.renderCertifications([]);
            return;
        }

        try {
            const { contractsList, certificationsList, paymentsList } = await this.getCompanyContractsData();
            const companyTax = this.utils.getCompanyTaxPercentage(companies.currentCompany);

            const enrichedCerts = certificationsList.map(certification => {
                const contract = contractsList.find(contractItem => contractItem.id === certification.contractId);
                const contractCertifications = certificationsList
                    .filter(item => item.contractId === certification.contractId)
                    .sort((a, b) => this.utils.comparePeriods(a, b));
                const certifiedToDate = contractCertifications
                    .filter(item => this.utils.comparePeriods(item, certification) <= 0)
                    .reduce((sum, item) => sum + this.utils.calculateTotalWithTax(item.amount, companyTax), 0);
                const salaryGenerated = this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0);
                const salaryPaid = this.getSalaryPaidForCertification(certification, paymentsList);
                const salaryPending = this.utils.roundMoney(Math.max(0, salaryGenerated - salaryPaid));
                const certifiedWithTax = this.utils.calculateTotalWithTax(certification.amount, companyTax);
                const contractTotal = this.utils.calculateTotalWithTax(contract?.serviceValue || 0, companyTax);
                const pendingContractAmount = this.utils.roundMoney(Math.max(0, contractTotal - certifiedToDate));

                return {
                    ...certification,
                    contractCode: contract?.code || 'N/A',
                    contractClient: contract?.client || 'N/A',
                    contractTotal,
                    certifiedWithTax,
                    pendingContractAmount,
                    salaryPercentage: this.utils.toNumber(contract?.salaryPercentage),
                    salaryGenerated,
                    salaryPaid,
                    salaryPending,
                    statusLabel: salaryPending <= 0 ? 'pagado' : salaryPaid > 0 ? 'parcial' : (certification.status || 'pendiente')
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
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 20px;">
                        No hay certificaciones registradas. Haz clic en "Nueva Certificación" para agregar una.
                    </td>
                </tr>
            `;
            return;
        }

        certifications.forEach(cert => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${cert.contractCode}<br><small>${cert.contractClient}</small></td>
                <td>${this.getMonthName(cert.month)}/${cert.year}</td>
                <td>${this.utils.formatCurrency(cert.amount)}</td>
                <td>
                    ${this.utils.formatCurrency(cert.certifiedWithTax)}<br>
                    <small>Pendiente contrato: ${this.utils.formatCurrency(cert.pendingContractAmount)}</small>
                </td>
                <td>
                    ${this.utils.formatCurrency(cert.salaryGenerated)}<br>
                    <small>Pagado: ${this.utils.formatCurrency(cert.salaryPaid)} · Pendiente: ${this.utils.formatCurrency(cert.salaryPending)}</small>
                </td>
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
        const activeContracts = contractsList.filter(contract => (contract.status || 'activo') === 'activo');
        if (activeContracts.length === 0) {
            this.showMessage('No hay contratos activos para crear certificaciones', 'error');
            return;
        }

        const contractOptions = activeContracts.map(contract => `
            <option value="${contract.id}" data-salary="${contract.salaryPercentage}" ${certification?.contractId === contract.id ? 'selected' : ''}>
                ${contract.code} - ${contract.client}
            </option>
        `).join('');

        const form = `
            <div class="form-group">
                <label for="cert-contract">Contrato *:</label>
                <select id="cert-contract" required>
                    <option value="">Seleccionar contrato</option>
                    ${contractOptions}
                </select>
            </div>
            <div class="form-group">
                <label for="cert-month">Mes *:</label>
                <select id="cert-month" required>
                    <option value="">Seleccionar mes</option>
                    ${Array.from({ length: 12 }, (_, index) => `
                        <option value="${index + 1}" ${certification?.month === index + 1 ? 'selected' : ''}>
                            ${['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][index]}
                        </option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="cert-year">Año *:</label>
                <input type="number" id="cert-year" min="2020" max="2100" value="${certification?.year || new Date().getFullYear()}" required>
            </div>
            <div class="form-group">
                <label for="cert-amount">Monto certificado ($) *:</label>
                <input type="number" id="cert-amount" step="0.01" min="0.01" value="${certification?.amount || ''}" required>
                <small>Sobre este monto se calcularán impuestos y salario generado.</small>
            </div>
            <div class="form-group">
                <label for="cert-status">Estado:</label>
                <select id="cert-status">
                    <option value="pendiente" ${(certification?.status || 'pendiente') === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="aprobado" ${certification?.status === 'aprobado' ? 'selected' : ''}>Aprobado</option>
                </select>
            </div>
            <div class="form-group">
                <label for="cert-notes">Notas:</label>
                <textarea id="cert-notes" rows="3">${certification?.notes || ''}</textarea>
            </div>
            <div id="cert-preview" style="background:#f5f5f5;padding:15px;border-radius:5px;margin-top:15px;display:none;">
                <h4>Resumen</h4>
                <p><strong>Monto certificado:</strong> <span id="preview-service">$0.00</span></p>
                <p><strong>Monto certificado + impuestos:</strong> <span id="preview-contract">$0.00</span></p>
                <p><strong>Salario generado:</strong> <span id="preview-salary">$0.00</span> (<span id="preview-percentage">0</span>%)</p>
            </div>
        `;

        modal.show({
            title: certification ? 'Editar Certificación' : 'Nueva Certificación',
            body: form,
            onSave: () => this.saveCertification(certification?.id)
        });

        const amountInput = document.getElementById('cert-amount');
        const contractSelect = document.getElementById('cert-contract');
        const previewDiv = document.getElementById('cert-preview');
        const updatePreview = () => {
            const amount = this.utils.toNumber(amountInput.value);
            const salaryPercentage = this.utils.toNumber(contractSelect.selectedOptions[0]?.dataset.salary);
            const companyTax = this.utils.getCompanyTaxPercentage(companies.currentCompany);
            previewDiv.style.display = amount > 0 ? 'block' : 'none';
            document.getElementById('preview-service').textContent = this.utils.formatCurrency(amount);
            document.getElementById('preview-contract').textContent = this.utils.formatCurrency(this.utils.calculateTotalWithTax(amount, companyTax));
            document.getElementById('preview-salary').textContent = this.utils.formatCurrency(this.utils.calculateSalaryAmount(amount, salaryPercentage));
            document.getElementById('preview-percentage').textContent = salaryPercentage.toFixed(2);
        };
        amountInput?.addEventListener('input', updatePreview);
        contractSelect?.addEventListener('change', updatePreview);
        if (certification?.amount) updatePreview();
    }

    async saveCertification(id = null) {
        const contractId = document.getElementById('cert-contract').value;
        const month = Number.parseInt(document.getElementById('cert-month').value, 10);
        const year = Number.parseInt(document.getElementById('cert-year').value, 10);
        const amount = this.utils.toNumber(document.getElementById('cert-amount').value);
        const status = document.getElementById('cert-status').value;
        const notes = document.getElementById('cert-notes').value.trim();

        if (!contractId || !month || !year || amount <= 0) {
            this.showMessage('Completa todos los campos requeridos correctamente', 'error');
            return;
        }

        try {
            const contract = await db.get('contracts', contractId);
            if (!contract) {
                this.showMessage('Contrato no encontrado', 'error');
                return;
            }

            const existingCerts = await db.getAll('certifications', 'contractId', contractId);
            const duplicate = existingCerts.find(item => item.id !== id && item.month === month && item.year === year);
            if (duplicate) {
                this.showMessage(`Ya existe una certificación para ${month}/${year} en este contrato`, 'error');
                return;
            }

            const certification = {
                contractId,
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
        if (certification) {
            this.showCertificationForm(certification);
        } else {
            this.showMessage('Certificación no encontrada', 'error');
        }
    }

    async deleteCertification(id) {
        if (!confirm('¿Estás seguro de eliminar esta certificación?')) return;

        try {
            const paymentsList = await db.getAll('payments', 'companyId', companies.currentCompany.id);
            const certificationPayments = paymentsList.filter(payment => (payment.allocations || []).some(allocation => allocation.certificationId === id));
            for (const payment of certificationPayments) {
                await db.delete('payments', payment.id);
            }

            const invoicesList = await db.getAll('invoices', 'companyId', companies.currentCompany.id);
            const certificationInvoices = invoicesList.filter(invoice => invoice.certificationId === id);
            for (const invoice of certificationInvoices) {
                await db.delete('invoices', invoice.id);
            }

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
        if (window.auth?.showMessage) {
            auth.showMessage(message, type);
        } else {
            alert(message);
        }
    }
}

let certifications;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    certifications = new Certifications();
    window.certifications = certifications;
});
