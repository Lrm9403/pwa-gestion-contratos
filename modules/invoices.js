class Invoices {
    constructor() {
        this.init();
    }

    init() {
        document.getElementById('add-invoice')?.addEventListener('click', () => this.showInvoiceForm());
    }

    async loadInvoices() {
        if (!contracts?.currentCompany || !auth.currentUser) return;
        
        try {
            const invoices = await db.getAll('invoices', 'companyId', contracts.currentCompany.id);
            this.renderInvoices(invoices);
        } catch (error) {
            console.error('Error al cargar facturas:', error);
        }
    }

    renderInvoices(invoices) {
        const tbody = document.getElementById('invoices-list');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (invoices.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="6" style="text-align: center; padding: 20px;">
                    No hay facturas registradas
                </td>
            `;
            tbody.appendChild(row);
            return;
        }
        
        invoices.forEach(invoice => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${invoice.number || 'N/A'}</td>
                <td>${invoice.contractCode || 'N/A'}</td>
                <td>${new Date(invoice.date).toLocaleDateString('es-ES')}</td>
                <td>$${(invoice.amount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td><span class="status ${invoice.status || 'pendiente'}">${invoice.status || 'pendiente'}</span></td>
                <td>
                    <button class="btn btn-sm btn-success">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    showInvoiceForm() {
        alert('Funcionalidad de facturas en desarrollo');
    }
}

// Inicializar
let invoices;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    invoices = new Invoices();
    window.invoices = invoices;
});
