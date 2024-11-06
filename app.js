require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// MongoDB connection
const client = new MongoClient(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

async function connectToMongo() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
  }
}

connectToMongo();
const db = client.db('alchemist_test');
const messagesCollection = db.collection('wa_messages');
const contactsCollection = db.collection('wa_contacts');
const campaignCollection = db.collection('wa_campaign');

// Utility function to generate an alphanumeric code
function generateAlphanumericCode() {
  return crypto.randomBytes(5).toString('hex');
}

// Function to send response to WhatsApp API
async function sendWhatsAppResponse(contact, messageBody) {
  const payload = {
    contacts: [
      {
        profile: {
          name: contact.profile.name
        },
        wa_id: contact.wa_id
      }
    ],
    messages: [
      {
        from: process.env.PHONE_NUMBER_ID,
        id: `wamid.${generateAlphanumericCode()}`,  // Generate a unique ID
        timestamp: Math.floor(Date.now() / 1000).toString(),
        text: {
          body: messageBody
        },
        type: "text"
      }
    ]
  };

  try {
    const response = await axios.post(`https://graph.facebook.com/v13.0/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/messages`, payload, {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log("WhatsApp response sent:", response.data);
  } catch (error) {
    console.error("Failed to send WhatsApp response:", error);
  }
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    // Extract data from WhatsApp webhook payload
    const entry = req.body.entry && req.body.entry[0];
    if (!entry) {
      return res.status(400).json({ error: "Invalid WhatsApp webhook payload" });
    }

    const changes = entry.changes && entry.changes[0];
    const messagingData = changes.value;
    const contact = messagingData.contacts && messagingData.contacts[0];
    const messageInfo = messagingData.messages && messagingData.messages[0];

    // Extract relevant fields
    const number = contact.wa_id;
    const wa_name = contact.profile.name;
    const message = messageInfo.text.body;

    // Extract the code from the message, assuming it is sent in the format "code: ABC123"
    const codeMatch = message.match(/code:\s*(\w+)/i);
    const code = codeMatch ? codeMatch[1] : generateAlphanumericCode();  // Use the extracted code or generate one if not found

    // Check if the number already exists in wa_contacts collection
    let existingContact = await contactsCollection.findOne({ phone: number });
    if (!existingContact) {
      // Insert new contact into wa_contacts collection
      existingContact = await contactsCollection.insertOne({
        phone: number,
        name: wa_name,
        wa_name: wa_name,
      });
      console.log("New contact created:", existingContact);
    }

    // Insert the message and campaign entries with the extracted code
    await messagesCollection.insertOne({
      name: wa_name,
      code: code,
    });

    await campaignCollection.insertOne({
      name: wa_name,
      code: code,
      description: message,
    });

    // Send a response to WhatsApp after a successful entry
    await sendWhatsAppResponse(contact, "Your entry has been successfully created!");

    res.status(201).json({ message: "Entry created successfully", code });
    
  } catch (error) {
    console.error("Error handling webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
