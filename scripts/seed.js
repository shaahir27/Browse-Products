import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const dbURL = new URL(process.env.DATABASE_URL);

const DB_HOST = dbURL.hostname;
const DB_PORT = dbURL.port;
const DB_USER = dbURL.username;
const DB_PASSWORD = dbURL.password;
const DB_NAME = dbURL.pathname.slice(1);

const TOTAL_PRODUCTS = 200000;
const BATCH_SIZE = 1000;

const categories = [
    "Electronics",
    "Books",
    "Sports",
    "Fashion",
    "Home",
    "Beauty",
    "Toys",
    "Automotive",
]


function getRandomCategory() {
    const randomIndex = Math.floor(Math.random() * categories.length);
    return categories[randomIndex];
}

function randomPrice() {
    const price = (Math.random() * 1000).toFixed(2);
    return price;
}

function randomDate(){
    const now = new Date();

    const twoYearsAgo = now - 2 * 365 * 24 * 60 * 60 * 1000;

    const randomDate = Math.random() * (now - twoYearsAgo) + twoYearsAgo;

    return new Date(randomDate);
}

function productgeneration(index){

    const category = getRandomCategory();
    const price = randomPrice();
    const created_at = randomDate();

    return [
        `Product ${index}`,
        category,
        price,
        created_at,
        created_at
    ]
}

async function seedDatabase(){

    const connection = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,

        ssl: {
            rejectUnauthorized: false
        }
    });

    console.log("Connected to the database.");

    try{

        const totalBatches = TOTAL_PRODUCTS / BATCH_SIZE;

        for(let batchnumber = 0; batchnumber < totalBatches; batchnumber++){ 
        
            const batch = [];

            for(let i=0; i<BATCH_SIZE; i++){
                const productIndex = BATCH_SIZE * batchnumber + i + 1;

                const product = productgeneration(productIndex);

                batch.push(product);
            }

            await connection.query(
                `
                INSERT INTO products (name, category, price, created_at, updated_at)
                VALUES ?
                `,
                [batch]
            )

            console.log(`Batch ${batchnumber + 1}/${totalBatches} inserted successfully.`);
        }
    }
    catch(err){
        console.error("Error seeding the database:", err);  
    }
    finally{
        await connection.end();
        console.log("Database connection closed.");
    }
}

seedDatabase();