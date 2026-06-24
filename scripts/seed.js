require("dotenv").config();
const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
const mysql = require("mysql2/promise");

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

    category = getRandomCategory();
    price = randomPrice();
    created_at = randomDate();

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
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
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
                INSERT INTO browser.products (name, category, price, created_at, updated_at)
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