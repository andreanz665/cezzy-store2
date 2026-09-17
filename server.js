const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Inisialisasi Database SQLite
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Gagal terhubung ke database:', err.message);
    } else {
        console.log('Terhubung ke database SQLite.');
    }
});

// Buat Tabel Products
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            price INTEGER NOT NULL,
            stock INTEGER NOT NULL DEFAULT 0,
            category TEXT NOT NULL,
            image TEXT,
            description TEXT
        )
    `);

    // Masukkan data awal jika tabel kosong
    db.get(`SELECT COUNT(*) as count FROM products`, (err, row) => {
        if (row && row.count === 0) {
            const initialProducts = [
                ['1', 'Capcut Pro 1 Bulan', 25000, 10, 'Software', 'https://cdn.phototourl.com/free/2026-09-12-bdba3c82-b407-42ae-b585-8ec690856a1f.jpg', 'Akses penuh fitur Capcut Pro.'],
                ['2', 'Canva Pro 1 Bulan', 8000, 15, 'Software', 'https://cdn.phototourl.com/free/2026-09-12-bcaa194b-5441-4e86-a359-089cb8b2054f.jpg', 'Desain tanpa batas dengan elemen Canva Pro.'],
                ['3', 'Alight Motion 1 TAHUN', 5000, 0, 'Software', 'https://cdn.phototourl.com/free/2026-09-12-e893dc8b-2884-4187-8c91-30b86bb38593.jpg', 'Preset & efek tanpa watermark Alight Motion Pro.'],
                ['6', 'YouTube Premium 1 Bulan', 22000, 5, 'Streaming', 'https://user32007.na.imgto.link/public/20260912/3e7134fd-f2f9-4caf-84a4-c2e05ecaa29f.avif', 'Nonton video bebas iklan.']
            ];

            const stmt = db.prepare(`INSERT INTO products (id, title, price, stock, category, image, description) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            initialProducts.forEach(p => stmt.run(p));
            stmt.finalize();
            console.log('Data sampel produk berhasil dimuat.');
        }
    });
});

// ================= API ENDPOINTS =================

// 1. Get All Products
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. Checkout / Potong Stok Otomatis
app.post('/api/checkout', (req, res) => {
    const { items } = req.body; // Array items [{ id: "1", qty: 2 }]

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Keranjang belanja kosong.' });
    }

    db.serialize(() => {
        // Cek stok setiap item terlebih dahulu
        let outOfStock = false;
        let errorMessage = '';

        const checkPromises = items.map(item => {
            return new Promise((resolve, reject) => {
                db.get(`SELECT stock, title FROM products WHERE id = ?`, [item.id], (err, row) => {
                    if (err) return reject(err);
                    if (!row) return reject(new Error(`Produk ID ${item.id} tidak ditemukan.`));
                    if (row.stock < item.qty) {
                        outOfStock = true;
                        errorMessage = `Stok untuk "${row.title}" tidak mencukupi (sisa: ${row.stock}).`;
                    }
                    resolve();
                });
            });
        });

        Promise.all(checkPromises)
            .then(() => {
                if (outOfStock) {
                    return res.status(400).json({ success: false, message: errorMessage });
                }

                // Kurangi Stok Secara Otomatis
                const updateStmt = db.prepare(`UPDATE products SET stock = stock - ? WHERE id = ?`);
                items.forEach(item => {
                    updateStmt.run([item.qty, item.id]);
                });
                updateStmt.finalize();

                res.json({ success: true, message: 'Transaksi berhasil, stok telah dikurangi!' });
            })
            .catch(err => {
                res.status(500).json({ success: false, message: err.message });
            });
    });
});

// 3. Update / Edit Stok Produk (Untuk Admin saat stok habis)
app.put('/api/products/:id/stock', (req, res) => {
    const { id } = req.params;
    const { stock } = req.body;

    if (stock === undefined || stock < 0) {
        return res.status(400).json({ success: false, message: 'Jumlah stok tidak valid.' });
    }

    db.run(`UPDATE products SET stock = ? WHERE id = ?`, [stock, id], function (err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        }
        res.json({ success: true, message: `Stok produk ID ${id} berhasil diperbarui menjadi ${stock}.` });
    });
});

app.listen(PORT, () => {
    console.log(`Server Backend CezzyStore berjalan di http://localhost:${PORT}`);
});