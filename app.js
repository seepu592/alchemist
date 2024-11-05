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
const messagesCollection = db.collection('wa_campaign');
const contactsCollection = db.collection('wa_contacts');

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
    const templateMessage = "Expected template message here"; // replace with actual template if needed

    if (!number || !message) {
      return res.status(400).json({ error: "Number and message are required" });
    }

    // Check if the number already exists in wa_contacts collection
    let existingContact = await contactsCollection.findOne({ phone: number });
    if (!existingContact) {
      // Insert new contact into wa_contacts collection
      existingContact = await contactsCollection.insertOne({
        phone: number,
        name: wa_name,
        wa_name,
        createdAt: new Date()
      });
      console.log("New contact created:", existingContact);
    }

    // Check if the number already exists in wa_campaign collection
    const existingCampaign = await messagesCollection.findOne({ number });
    if (existingCampaign) {
      // Validate the message against the template if required
      if (existingCampaign.templateMessage !== templateMessage) {
        return res.status(400).json({ error: "Message does not match the template." });
      }
      return res.status(200).json({ message: "Number already exists in the database" });
    } else {
      // Create a new entry if the number doesn't exist in wa_campaign
      const alphanumericCode = generateAlphanumericCode();
      await messagesCollection.insertOne({
        number,
        message,
        alphanumericCode,
        templateMessage,
      });

      // Send a response to WhatsApp after a successful entry
      await sendWhatsAppResponse(contact, "Your entry has been successfully created!");

      res.status(201).json({ message: "Entry created successfully", alphanumericCode });
    }
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
