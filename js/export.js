// Función para exportar a Excel
function exportToExcel(data, fileName) {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    
    // Ajustar ancho de columnas
    const wscols = [
        { wch: 15 },
        { wch: 20 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 }
    ];
    ws['!cols'] = wscols;
    
    XLSX.writeFile(wb, fileName);
}

// Función para exportar a PDF
function exportToPDF(options) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Título
    doc.setFontSize(16);
    doc.text(options.title, 14, 15);
    
    // Fecha
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 25);
    
    // Tabla
    doc.autoTable({
        head: [options.headers],
        body: options.data,
        startY: 30,
        styles: {
            fontSize: 8,
            cellPadding: 2
        },
        headStyles: {
            fillColor: [44, 62, 80],
            textColor: 255,
            fontStyle: 'bold'
        }
    });
    
    // Guardar
    doc.save(options.fileName);
}

// Función para exportar reporte completo
async function exportFullReport(db, company) {
    const contracts = await db.contracts.where('companyId').equals(company.id).toArray();
    const certifications = await db.certifications.where('companyId').equals(company.id).toArray();
    const payments = await db.payments.where('companyId').equals(company.id).toArray();
    
    const reportData = {
        empresa: company,
        fechaGeneracion: new Date().toISOString(),
        contratos: contracts,
        certificaciones: certifications,
        pagos: payments,
        resumen: {
            totalContratos: contracts.length,
            totalCertificado: certifications.reduce((sum, c) => sum + c.monto, 0),
            totalPagado: payments.reduce((sum, p) => sum + p.monto, 0)
        }
    };
    
    return reportData;
}
