const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { generateDeliveryNotePDF, generateWarrantyLetterPDF } = require('./pdfService');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 1. Create Quotation (Duplicate Prevention via Unique Constraint)
app.post('/api/quotations', async (req, res) => {
    const { client_id, inquiry_reference, version_number, total_amount, valid_until, items } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const quoteRef = `QT-2026-${client_id}-${Math.floor(100 + Math.random() * 900)}`;
        const quoteResult = await client.query(
            `INSERT INTO quotations (quotation_ref, client_id, inquiry_reference, version_number, total_amount, valid_until)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;`,
            [quoteRef, client_id, inquiry_reference, version_number || 1, total_amount, valid_until]
        );
        const quotationId = quoteResult.rows[0].quotation_id;

        for (let item of items) {
            await client.query(
                `INSERT INTO quotation_items (quotation_id, item_code, description, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)`,
                [quotationId, item.item_code, item.description, item.quantity, item.unit_price]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, quotation: quoteResult.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Duplicate quotation detected for this client inquiry and version.' });
        }
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// 2. Create Delivery Note, Update LPO Balances, and Auto-Generate Warranty
app.post('/api/delivery-notes', async (req, res) => {
    const { dn_number, lpo_id, delivery_date, carrier_name, receiver_name, items } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const dnResult = await client.query(
            `INSERT INTO delivery_notes (dn_number, lpo_id, delivery_date, carrier_name, receiver_name, status)
             VALUES ($1, $2, $3, $4, $5, 'Delivered') RETURNING *;`,
            [dn_number, lpo_id, delivery_date, carrier_name, receiver_name]
        );
        const deliveryNoteId = dnResult.rows[0].delivery_note_id;

        for (let item of items) {
            const lpoItemCheck = await client.query(
                `SELECT remaining_qty FROM lpo_items WHERE lpo_item_id = $1`,
                [item.lpo_item_id]
            );
            const remaining = parseFloat(lpoItemCheck.rows[0].remaining_qty);
            if (item.quantity_delivered > remaining) {
                throw new Error(`Delivery quantity exceeds remaining LPO balance (${remaining}).`);
            }

            await client.query(
                `INSERT INTO delivery_note_items (delivery_note_id, lpo_item_id, quantity_delivered, serial_numbers)
                 VALUES ($1, $2, $3, $4)`,
                [deliveryNoteId, item.lpo_item_id, item.quantity_delivered, item.serial_numbers]
            );

            await client.query(
                `UPDATE lpo_items SET delivered_qty = delivered_qty + $1 WHERE lpo_item_id = $2`,
                [item.quantity_delivered, item.lpo_item_id]
            );
        }

        const clientInfo = await client.query(`SELECT client_id FROM lpos WHERE lpo_id = $1`, [lpo_id]);
        const clientId = clientInfo.rows[0].client_id;
        const warrantyRef = `WAR-${Date.now()}`;
        const expiryDate = new Date(delivery_date);
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);

        await client.query(
            `INSERT INTO warranties (warranty_reference, delivery_note_id, client_id, start_date, expiry_date, coverage_terms)
             VALUES ($1, $2, $3, $4, $5, 'Standard 12-month manufacturer defect warranty.')`,
            [warrantyRef, deliveryNoteId, clientId, delivery_date, expiryDate]
        );

        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Delivery Note created & Warranty generated.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// 3. PDF Download Routes
app.get('/api/delivery-notes/:id/pdf', async (req, res) => {
    const dnData = {
        dn_number: 'DN-2026-00142',
        delivery_date: '2026-10-30',
        client_name: 'Acme Corporation',
        billing_address: '456 Industrial Parkway',
        lpo_number: 'LPO-8842',
        carrier_name: 'FastTransit',
        receiver_name: 'John Doe',
        items: [{ item_code: 'MOD-X1', description: 'Control Module', quantity_delivered: 10, serial_numbers: 'SN-101 to 110' }]
    };
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${dnData.dn_number}.pdf`);
    generateDeliveryNotePDF(dnData, res);
});

app.get('/api/warranties/:id/pdf', async (req, res) => {
    const warrantyData = {
        warranty_reference: 'WAR-2026-0042',
        dn_number: 'DN-2026-00142',
        client_name: 'Acme Corporation',
        start_date: '2026-10-30',
        expiry_date: '2027-10-30',
        items: [{ item_code: 'MOD-X1', description: 'Control Module', serial_numbers: 'SN-101 to 110' }]
    };
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${warrantyData.warranty_reference}.pdf`);
    generateWarrantyLetterPDF(warrantyData, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));