require('dotenv').config();
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
async function insertDocument() {
  // Set up MongoDB client
//   const client = new MongoClient(process.env.MONGO_URI, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   });

  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB");

    // Select the database and collection
    const db = client.db('alchemist_test');
    const collection = db.collection('wa_campaign');

    // Document to insert
    const document = {
      name: "test1",
      code: "ABC124",
      description: "Hello1",
    };

    // Insert the document into the collection
    const result = await collection.insertOne(document);
    console.log("Document inserted with _id:", result.insertedId);
  } catch (error) {
    console.error("Error inserting document:", error);
  } finally {
    // Close the MongoDB connection
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Run the insert function
insertDocument();
