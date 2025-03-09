const mqtt = require('mqtt');
const mysql = require('mysql2');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001; // Define the port for the server
app.use(cors());

app.use(express.json()); // Important: Ensures req.body is parsed
app.use(express.urlencoded({ extended: true })); // Parses URL-encoded data


// ✅ MQTT Broker & MySQL Database Details
const MQTT_BROKER = 'mqtt://34.131.24.103';
const MQTT_PORT = 1883;
const MYSQL_HOST = '34.100.191.61';
const MYSQL_USER = 'vidhya';
const MYSQL_PASSWORD = 'Maybe123';
const MYSQL_DATABASE = 'unplug';

// ✅ Connect to MySQL Database
const db = mysql.createConnection({
    host: MYSQL_HOST,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE
});

db.connect(err => {
    if (err) {
        console.error("❌ MySQL Connection Error: " + err.message);
        process.exit(1);
    }
    console.log("✅ Connected to MySQL Database!");
});

// ✅ Connect to MQTT Broker
const client = mqtt.connect(MQTT_BROKER, { port: MQTT_PORT });

// ✅ Topics for Air Sensors (Stored in MySQL)
const airTopics = {
    "air/temp": "temperature",
    "air/humidity": "humidity",
    "air/pressure": "pressure",
    "air/altitude": "altitude",
    "air/dewPoint": "dew_point",
    "air/airQuality": "air_quality",
    "air/dustDensity": "dust_density",
    "air/PM2.5": "pm25"
};

// ✅ Topics for Parking Sensors (NOT stored in MySQL, only printed)
const parkingTopics = {
    "parking/status": "status",
    "parking/flow": "flow",
    "parking/sound": "sound",
    "parking/rfid": "rfid",
    "parking/vacancy": "vacancy"
};

// ✅ Store Latest Parking Data (Global Variable)
let latestParkingData = {
    status: "Unknown",
    flow: 0,
    sound: 0,
    rfid: "N/A",
    vacancy: 0
};

// ✅ On MQTT Connection
client.on('connect', () => {
    console.log("✅ Connected to MQTT Broker!");

    // ✅ Subscribe to Air and Parking Topics
    const allTopics = { ...airTopics, ...parkingTopics };
    client.subscribe(Object.keys(allTopics), (err) => {
        if (err) {
            console.error("❌ MQTT Subscription Error: " + err.message);
        } else {
            console.log("✅ Subscribed to Topics:", Object.keys(allTopics));
        }
    });

    let sensorData = {}; // Store sensor data temporarily before inserting into MySQL

    // ✅ MQTT Message Handling
    client.on('message', (topic, message) => {
        const columnName = allTopics[topic];
        if (!columnName) return;

        let value = message.toString();

        // Convert to number where applicable
        if (columnName !== "status" && columnName !== "rfid") {
            value = parseFloat(value);
            if (isNaN(value)) return;
        }

        // ✅ Handle Air Sensor Data (Stored in MySQL)
        if (airTopics[topic]) {
            sensorData[columnName] = value;

            if (Object.keys(sensorData).length === Object.keys(airTopics).length) {
                const sql = `
                    INSERT INTO sensor_data (temperature, humidity, pressure, altitude, dew_point, air_quality, dust_density, pm25)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                const values = [
                    sensorData.temperature || null,
                    sensorData.humidity || null,
                    sensorData.pressure || null,
                    sensorData.altitude || null,
                    sensorData.dew_point || null,
                    sensorData.air_quality || null,
                    sensorData.dust_density || null,
                    sensorData.pm25 || null
                ];

                db.query(sql, values, (err) => {
                    if (err) {
                        console.error("❌ MySQL Insert Error:", err.message);
                    } else {
                        console.log("✅ Air Sensor Data Inserted Successfully!");
                    }
                });

                sensorData = {}; // Reset sensorData
            }
        }

        // ✅ Handle Parking Data (ONLY PRINT, NOT STORED)
        if (parkingTopics[topic]) {
            latestParkingData[columnName] = value;
            console.log(`🚗 Parking Update: ${columnName} = ${value}`);
        }
    });
});

// ✅ Handle MQTT Errors
client.on('error', (err) => {
    console.error("❌ MQTT Client Error: " + err.message);
});

// ✅ API - Get Latest Air Sensor Data (From MySQL)
app.get('/sensordata', (req, res) => {
    const sql = "SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: "No sensor data found" });

        res.json(results[0]);
    });
});

// ✅ API - Get Latest Parking Data (Directly from MQTT)
app.get('/parkingdata', (req, res) => {
    res.json(latestParkingData);
});

// ✅ API - Get Latest Predicted Sensor Data (From MySQL)
app.get('/predicteddata', (req, res) => {
    const sql = "SELECT * FROM predicted_sensor_data ORDER BY id DESC LIMIT 1"; // Fetch the latest predicted record
    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: "No predicted data found" });
        }

        const data = results[0]; // Latest predicted data
        res.json({
            predicted_temperature: data.temperature,
            predicted_humidity: data.humidity,
            predicted_pressure: data.pressure,
            predicted_altitude: data.altitude,
            predicted_dew_point: data.dew_point,
            predicted_air_quality: data.air_quality,
            predicted_dust_density: data.dust_density,
            predicted_pm25: data.pm25,
            precautions: data.precautions, // Include precautions field
            timestamp: data.timestamp // Assuming you have a timestamp column
        });
    });
});
app.post("/register", (req, res) => {
    console.log("Incoming Request Body:", req.body); // Debugging

    const { name, rfid } = req.body;

    if (!name || !rfid) {
        return res.status(400).json({ message: "❌ Name and RFID are required!" });
    }

    const sql = "INSERT INTO park (name, rfid) VALUES (?, ?)";
    db.query(sql, [name, rfid], (err, result) => {
        if (err) {
            console.error("❌ Error inserting data:", err);
            return res.status(500).json({ message: "❌ Server Error!" });
        }
        res.status(200).json({ message: "✅ Registration Successful!" });
    });
});

// ✅ Handle Parking RFID Check
client.on('message', (topic, message) => {
    const columnName = parkingTopics[topic];
    if (!columnName) return;

    let value = message.toString();

    if (topic === "parking/rfid") {
        const sql = "SELECT * FROM park WHERE rfid = ?";
        db.query(sql, [value], (err, results) => {
            if (err) {
                console.error("❌ MySQL Query Error:", err.message);
                return;
            }

            const status = results.length > 0 ? "1" : "0"; // If found, send "1", else "0"
            client.publish("new/one", status, { retain: true });
            console.log(`🔄 Published to new/one: ${status}`);
        });
    }
});


// ✅ Start the Express Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
