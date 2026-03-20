class Salary {
    constructor() {
        this.utils = window.contractAppUtils;
        this.init();
    }

    init() {
        document.addEventListener('companyChanged', () => this.updateSalarySummary());
    }

    async updateSalarySummary() {
        if (!companies?.currentCompany || !auth?.currentUser) {
            this.renderSalarySummary(0, 0);
            this.renderSalaryDetails([]);
            return;
        }

        try {
            const [contractsList, certificationsList, paymentsList] = await Promise.all([
                db.getAll('contracts', 'companyId', companies.currentCompany.id),
                db.getAll('certifications', 'companyId', companies.currentCompany.id),
                db.getAll('payments', 'companyId', companies.currentCompany.id)
            ]);

            const paidMap = new Map();
            paymentsList
                .filter(payment => payment.purpose === 'salary')
                .forEach(payment => {
                    (payment.allocations || []).forEach(allocation => {
                        if (!allocation.certificationId) return;
                        paidMap.set(allocation.certificationId, this.utils.roundMoney((paidMap.get(allocation.certificationId) || 0) + this.utils.toNumber(allocation.amount)));
                    });
                });

            const salaryRows = certificationsList
                .map(certification => {
                    const contract = contractsList.find(item => item.id === certification.contractId);
                    const generated = this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0);
                    const paid = paidMap.get(certification.id) || 0;
                    const pending = this.utils.roundMoney(Math.max(0, generated - paid));
                    return {
                        certification,
                        contract,
                        generated,
                        paid,
                        pending
                    };
                })
                .sort((a, b) => this.utils.comparePeriods(a.certification, b.certification));

            const totalGenerated = salaryRows.reduce((sum, item) => sum + item.generated, 0);
            const totalPaid = salaryRows.reduce((sum, item) => sum + item.paid, 0);

            this.renderSalarySummary(totalGenerated, totalPaid);
            this.renderSalaryDetails(salaryRows);
            this.updateDashboard(totalGenerated, totalPaid, certificationsList);
        } catch (error) {
            console.error('Error al calcular salarios:', error);
            this.showMessage('Error al calcular salarios', 'error');
        }
    }

    renderSalarySummary(generated, paid) {
        const pending = this.utils.roundMoney(Math.max(0, generated - paid));
        document.getElementById('total-salary-due').textContent = this.utils.formatCurrency(pending);
        document.getElementById('total-salary-paid').textContent = this.utils.formatCurrency(paid);
    }

    renderSalaryDetails(salaryRows) {
        const tbody = document.getElementById('salary-list');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (salaryRows.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 20px;">No hay datos de salarios disponibles.</td>
                </tr>
            `;
            return;
        }

        salaryRows.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.contract?.code || 'N/A'}<br><small>${item.contract?.client || ''}</small><br><small>${this.utils.getCertificationPeriodLabel(item.certification)}</small></td>
                <td>${this.utils.formatCurrency(item.generated)}<br><small>${this.utils.toNumber(item.contract?.salaryPercentage).toFixed(2)}%</small></td>
                <td>${this.utils.formatCurrency(item.paid)}</td>
                <td>${this.utils.formatCurrency(item.pending)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="salary.paySalary('${item.contract?.id || ''}', '${item.certification.id}')" ${item.pending <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-money-bill-wave"></i> Pagar
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    updateDashboard(generated, paid, certificationsList) {
        const salaryToPay = document.getElementById('salary-to-pay');
        const salaryPaid = document.getElementById('salary-paid');
        const pendingCerts = document.getElementById('pending-certs');

        if (salaryToPay) salaryToPay.textContent = this.utils.formatCurrency(Math.max(0, generated - paid));
        if (salaryPaid) salaryPaid.textContent = this.utils.formatCurrency(paid);
        if (pendingCerts) pendingCerts.textContent = certificationsList.filter(item => (item.status || 'pendiente') === 'pendiente').length;
    }

    async paySalary(contractId, certificationId = '') {
        if (!window.app || !window.payments) return;
        app.showSection('payments');
        setTimeout(() => {
            payments.showPaymentForm();
            setTimeout(() => {
                const purpose = document.getElementById('payment-purpose');
                const mode = document.getElementById('payment-mode');
                const contractFilter = document.getElementById('payment-contract-filter');
                if (purpose) {
                    purpose.value = 'salary';
                    purpose.dispatchEvent(new Event('change'));
                }
                if (mode) {
                    mode.value = certificationId ? 'manual' : 'automatic';
                    mode.dispatchEvent(new Event('change'));
                }
                if (contractFilter && contractId) {
                    contractFilter.value = contractId;
                    contractFilter.dispatchEvent(new Event('change'));
                }
                if (certificationId) {
                    setTimeout(() => {
                        const target = document.getElementById('payment-target');
                        if (target) target.value = certificationId;
                    }, 100);
                }
            }, 150);
        }, 150);
    }

    showMessage(message, type) {
        if (window.auth?.showMessage) {
            auth.showMessage(message, type);
        } else {
            alert(message);
        }
    }
}

let salary;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    salary = new Salary();
    window.salary = salary;
});
