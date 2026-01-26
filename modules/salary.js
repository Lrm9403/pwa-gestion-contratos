class Salary {
    constructor() {
        this.init();
    }

    init() {
        // Escuchar cambios de empresa
        document.addEventListener('companyChanged', () => this.updateSalarySummary());
        
        // Escuchar eventos de actualización
        document.addEventListener('contractAdded', () => this.updateSalarySummary());
        document.addEventListener('certificationAdded', () => this.updateSalarySummary());
        document.addEventListener('paymentAdded', () => this.updateSalarySummary());
    }

    async updateSalarySummary() {
        if (!companies?.currentCompany || !auth.currentUser) {
            console.log('No hay empresa seleccionada para calcular salarios');
            return;
        }
        
        try {
            const contracts = await db.getAll('contracts', 'companyId', companies.currentCompany.id);
            const certifications = await db.getAll('certifications', 'companyId', companies.currentCompany.id);
            const payments = await db.getAll('payments', 'companyId', companies.currentCompany.id);
            
            let totalSalaryGenerated = 0;
            let totalSalaryPaid = 0;
            const salaryByContract = [];
            
            // Calcular salario por contrato
            for (const contract of contracts) {
                const contractCerts = certifications.filter(c => c.contractId === contract.id);
                const contractSalary = contractCerts.reduce((sum, cert) => {
                    return sum + (cert.amount * (contract.salaryPercentage / 100));
                }, 0);
                
                const contractPayments = payments.filter(p => p.contractId === contract.id);
                const paidSalary = contractPayments.reduce((sum, payment) => {
                    return sum + payment.amount;
                }, 0);
                
                totalSalaryGenerated += contractSalary;
                totalSalaryPaid += paidSalary;
                
                salaryByContract.push({
                    contract,
                    generated: contractSalary,
                    paid: paidSalary,
                    pending: contractSalary - paidSalary
                });
            }
            
            this.renderSalarySummary(totalSalaryGenerated, totalSalaryPaid);
            this.renderSalaryDetails(salaryByContract);
            
            // Actualizar dashboard
            this.updateDashboard(totalSalaryGenerated, totalSalaryPaid);
            
        } catch (error) {
            console.error('Error al calcular salarios:', error);
            this.showMessage('Error al calcular salarios', 'error');
        }
    }

    renderSalarySummary(generated, paid) {
        const pending = generated - paid;
        
        document.getElementById('total-salary-due').textContent = 
            `$${pending.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        document.getElementById('total-salary-paid').textContent = 
            `$${paid.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
    }

    renderSalaryDetails(salaryData) {
        const tbody = document.getElementById('salary-list');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (salaryData.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" style="text-align: center; padding: 20px;">
                    No hay datos de salarios disponibles.
                </td>
            `;
            tbody.appendChild(row);
            return;
        }
        
        // Filtrar contratos con salario pendiente o generado
        const filteredData = salaryData.filter(item => item.generated > 0 || item.paid > 0);
        
        if (filteredData.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" style="text-align: center; padding: 20px;">
                    No hay salarios generados o pagados.
                </td>
            `;
            tbody.appendChild(row);
            return;
        }
        
        filteredData.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.contract.code}<br><small>${item.contract.client}</small></td>
                <td>$${item.generated.toLocaleString('es-ES', { minimumFractionDigits: 2 })}<br>
                    <small>(${item.contract.salaryPercentage}%)</small>
                </td>
                <td>$${item.paid.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td>$${item.pending.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="salary.paySalary('${item.contract.id}')" 
                            ${item.pending <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-money-bill-wave"></i> Pagar
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    updateDashboard(generated, paid) {
        const pending = generated - paid;
        
        // Actualizar estadísticas del dashboard
        const salaryToPay = document.getElementById('salary-to-pay');
        const salaryPaid = document.getElementById('salary-paid');
        
        if (salaryToPay) {
            salaryToPay.textContent = `$${pending.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        }
        
        if (salaryPaid) {
            salaryPaid.textContent = `$${paid.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        }
        
        // Actualizar contador de certificaciones pendientes
        this.updatePendingCertifications();
    }

    async updatePendingCertifications() {
        if (!companies?.currentCompany) return;
        
        try {
            const certifications = await db.getAll('certifications', 'companyId', companies.currentCompany.id);
            const pendingCerts = certifications.filter(c => c.status === 'pendiente');
            
            const pendingCertsElement = document.getElementById('pending-certs');
            if (pendingCertsElement) {
                pendingCertsElement.textContent = pendingCerts.length;
            }
        } catch (error) {
            console.error('Error al contar certificaciones pendientes:', error);
        }
    }

    async paySalary(contractId) {
        // Redirigir al módulo de pagos con el contrato pre-seleccionado
        if (window.app) {
            app.showSection('payments');
            
            // Esperar a que se cargue la sección de pagos
            setTimeout(() => {
                if (window.payments) {
                    payments.showPaymentForm();
                    
                    // Pre-seleccionar el contrato en el formulario
                    setTimeout(() => {
                        const autoContractSelect = document.getElementById('auto-contract');
                        if (autoContractSelect) {
                            autoContractSelect.value = contractId;
                            
                            // Disparar evento para actualizar información
                            const event = new Event('change');
                            autoContractSelect.dispatchEvent(event);
                        }
                    }, 100);
                }
            }, 300);
        }
    }

    showMessage(message, type) {
        if (window.auth && auth.showMessage) {
            auth.showMessage(message, type);
        } else {
            alert(message);
        }
    }
}

// Inicializar después de que la base de datos esté lista
let salary;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    salary = new Salary();
    window.salary = salary;
});
