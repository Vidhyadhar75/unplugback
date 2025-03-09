const mqtt = require('mqtt');
const mysql = require('mysql2');
const express = require('express');
const cors = require('cors');


const app = express();
const PORT = 3001; // Define the port for the server
app.use(cors());
// MQTT Broker and MySQL Database Details
const MQTT_BROKER = 'mqtt://34.131.24.103'; // Replace with your MQTT broker IP
const MQTT_PORT = 1883;
const MYSQL_HOST = '34.100.191.61'; // Replace with your MySQL database IP
const MYSQL_USER = 'vidhya';
const MYSQL_PASSWORD = 'Maybe123'; // Replace with your MySQL password
const MYSQL_DATABASE = 'unplug';

// Connect to MySQL Database
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

// Connect to MQTT Broker
const client = mqtt.connect(MQTT_BROKER, { port: MQTT_PORT });

client.on('connect', () => {
    console.log("✅ Connected to MQTT Broker!");
    
    // Subscribe to all air sensor topics
    const topics = {
        "air/temp": "temperature",
        "air/humidity": "humidity",
        "air/pressure": "pressure",
        "air/altitude": "altitude",
        "air/dewPoint": "dew_point",
        "air/airQuality": "air_quality",
        "air/dustDensity": "dust_density",
        "air/PM2.5": "pm25"
    };

    client.subscribe(Object.keys(topics), (err) => {
        if (err) {
            console.error("❌ MQTT Subscription Error: " + err.message);
        } else {
            console.log("✅ Subscribed to topics:", Object.keys(topics));
        }
    });

    // Object to store incoming sensor data
    let sensorData = {};

    client.on('message', (topic, message) => {
        const columnName = topics[topic];
        if (!columnName) return; // Ignore unknown topics

        const value = parseFloat(message.toString());
        if (isNaN(value)) return; // Ignore invalid values

        sensorData[columnName] = value;

        // If all values are received, insert into MySQL
        if (Object.keys(sensorData).length === Object.keys(topics).length) {
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

            db.query(sql, values, (err, result) => {
                if (err) {
                    console.error("❌ MySQL Insert Error:", err.message);
                } else {
                    console.log("✅ Data Inserted Successfully!");
                }
            });

            // Clear sensorData after inserting
            sensorData = {};
        }
    });
});

client.on('error', (err) => {
    console.error("❌ MQTT Client Error: " + err.message);
});

// ✅ Get Latest Sensor Data (All Fields)
app.get('/sensordata', (req, res) => {
    const sql = "SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1"; // Fetch the latest record
    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: "No sensor data found" });
        }

        const data = results[0]; // Latest sensor data
        res.json({
            temperature: data.temperature,
            humidity: data.humidity,
            pressure: data.pressure,
            altitude: data.altitude,
            dew_point: data.dew_point,
            air_quality: data.air_quality,
            dust_density: data.dust_density,
            pm25: data.pm25,
            timestamp: data.timestamp // Assuming you have a timestamp column
        });
    });
});

// ✅ Get Latest Predicted Sensor Data (All Fields) including "precautions"
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

// Start the Express server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
