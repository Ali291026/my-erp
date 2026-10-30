const PDFDocument = require('pdfkit');

function generateDeliveryNotePDF(data, stream) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(stream);

    doc.fontSize(20).text('DELIVERY NOTE', { align: 'right' });
    doc.fontSize(10).text(`DN Reference: ${data.dn_number}`, { align: 'right' });
    doc.text(`Date: ${data.delivery_date}`, { align: 'right' });
    doc.moveDown();

    doc.fontSize(12).text('Dispatched From:', { underline: true });
    doc.fontSize(10).text('Your Company Name Inc.\n123 Business Ave, Suite 100');
    doc.moveDown();

    doc.fontSize(12).text('Delivered To (Client):', { underline: true });
    doc.fontSize(10).text(`${data.client_name}\n${data.billing_address}\nLPO Ref: ${data.lpo_number}`);
    doc.moveDown();

    doc.fontSize(10).text(`Carrier: ${data.carrier_name || 'N/A'} | Vehicle: ${data.vehicle_number || 'N/A'}`);
    doc.moveDown(2);

    const tableTop = doc.y;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Item Code', 50, tableTop);
    doc.text('Description', 150, tableTop);
    doc.text('Delivered Qty', 380, tableTop, { width: 80, align: 'right' });
    doc.text('Serial Nos.', 470, tableTop, { width: 80, align: 'right' });
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    let rowTop = tableTop + 25;
    doc.font('Helvetica');
    data.items.forEach(item => {
        doc.text(item.item_code, 50, rowTop);
        doc.text(item.description || '-', 150, rowTop, { width: 220 });
        doc.text(item.quantity_delivered.toString(), 380, rowTop, { width: 80, align: 'right' });
        doc.text(item.serial_numbers || '-', 470, rowTop, { width: 80, align: 'right' });
        rowTop += 25;
    });

    doc.moveTo(50, rowTop + 5).lineTo(550, rowTop + 5).stroke();
    const sigTop = rowTop + 60;
    doc.text('Dispatched By (Storekeeper):', 50, sigTop);
    doc.text('Received In Good Order By:', 320, sigTop);
    doc.moveTo(50, sigTop + 40).lineTo(230, sigTop + 40).stroke();
    doc.moveTo(320, sigTop + 40).lineTo(500, sigTop + 40).stroke();
    doc.text('Signature & Stamp', 50, sigTop + 45);
    doc.text(`Name: ${data.receiver_name || 'Client'}`, 320, sigTop + 45);

    doc.end();
}

function generateWarrantyLetterPDF(data, stream) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(stream);

    doc.fontSize(18).text('CERTIFICATE OF WARRANTY', { align: 'center' });
    doc.fontSize(10).text(`Warranty Reference: ${data.warranty_reference}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Issued To: ${data.client_name}`);
    doc.text(`Linked Delivery Note: ${data.dn_number}`);
    doc.text(`Validity Period: ${data.start_date} to ${data.expiry_date}`);
    doc.moveDown(2);

    doc.fontSize(12).font('Helvetica-Bold').text('Terms & Coverage:');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(
        `This certificate guarantees that all products supplied under Delivery Note ${data.dn_number} are free from defects in material and workmanship under normal use. Our obligation is limited to repairing or replacing defective parts during the coverage period.`
    );
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Covered Items & Serials:');
    doc.moveDown(0.5);
    doc.font('Helvetica');
    data.items.forEach(item => {
        doc.text(`• ${item.item_code}: ${item.description} (Serials: ${item.serial_numbers || 'N/A'})`);
    });
    doc.moveDown(3);

    doc.text('Authorized Signatory:', 50, doc.y);
    doc.moveDown(2);
    doc.text('__________________________________\nQuality Assurance Manager\nYour Company Name Inc.');

    doc.end();
}

module.exports = { generateDeliveryNotePDF, generateWarrantyLetterPDF };