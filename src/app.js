import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../frontend/")));

const dbURL = new URL(process.env.DATABASE_URL);

const pool = mysql.createPool({
    host: dbURL.hostname,
    port: dbURL.port,
    user: dbURL.username,
    password: dbURL.password,
    database: dbURL.pathname.slice(1),

    ssl: {
        rejectUnauthorized: false
    },

    waitForConnections: true,
    connectionLimit: 30,
    queueLimit: 0,
    timezone: "Z"
})


app.get("/health", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT 1 as test");

        res.json({
            status: "ok",
            db: rows
        });
    }
    catch(err) {
        console.error(err);
        res.status(500).json({
            error: err.message
        });
    }
});


app.get("/products", async (req, res) => {

    try{

        const limit = req.query.limit ? parseInt(req.query.limit) : 20;

        const category = req.query.category;

        let snapshotTime = req.query.snapshotTime;

        const cursor = req.query.cursor;

        let rows;

        if(!snapshotTime){

            const [snapshotRows] = await pool.query(
                `
                SELECT MAX(created_at) 
                AS snapshot
                FROM products
                `
            );

            snapshotTime = snapshotRows[0].snapshot;

            if(category){
                [rows] = await pool.query(
                    `
                    SELECT * FROM products
                    WHERE category = ? AND created_at <= ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    `,

                    [category, snapshotTime, limit]
                )
            }
            else{
                [rows] = await pool.query(
                    `
                    SELECT * FROM products
                    WHERE created_at <= ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    `,

                    [snapshotTime, limit]
                )
            }

            let nextCursor = null;

            if(rows.length != 0){

                const created_at = rows[rows.length - 1].created_at;
                const id = rows[rows.length - 1].id;

                nextCursor = Buffer.from(
                    JSON.stringify({
                        created_at,
                        id
                    })
                ).toString("base64");
            }
            

            return res.json({
                products: rows,
                snapshotTime,
                nextCursor
            })
        }

        if(!cursor){
            return res.status(400).json({error: "Cursor is required"});
        }

        const decoded = JSON.parse(
            Buffer.from(
                cursor, 
            "base64").toString("utf-8"));

        const created_at = decoded.created_at;
        const id = decoded.id;

        if(category){
            [rows] = await pool.query(
                `
                SELECT * FROM products
                WHERE category = ? 
                AND created_at <= ? 
                    AND (
                        created_at < ? 
                        OR 
                        ( created_at = ? AND id < ? )
                    )
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                `,
                
                [category, snapshotTime, created_at, created_at, id, limit]
            )
        }
        else{
            [rows] = await pool.query(
                `
                SELECT * FROM products
                WHERE created_at <= ?
                AND ( created_at < ?
                    OR 
                    (created_at = ? AND id < ?)
                )
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                `,

                [snapshotTime, created_at, created_at, id, limit]
            )
        }

        let nextCursor = null

        if(rows.length !== 0){

            const next_created_at = rows[rows.length - 1].created_at;
            const next_id = rows[rows.length - 1].id;

            nextCursor = Buffer.from(
                JSON.stringify({
                    created_at: next_created_at,
                    id: next_id
                })
            ).toString("base64");

        }
        

        res.json({
            products: rows,
            snapshotTime,
            nextCursor
        })

    }
    catch(err){
        console.error(`Error: ${err}`);

        res.status(500).json({error: "Internal Server Error"});
    }
})

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("=================================");
    console.log(`Server running on port ${PORT}`);
    console.log("=================================");
});