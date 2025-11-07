from pymongo import MongoClient
from datetime import datetime

MONGO_URI = "mongodb://localhost:27017/"
client = MongoClient(MONGO_URI)
db = client['traffic_management_db']

# Clear existing data (optional)
db.violations.delete_many({})
db.incidents.delete_many({})
db.parking_zones.delete_many({})

# Sample data
sample_violations = [
    {
        "vehicle_number": "TN01AB1234",
        "violation_type": "Over Speeding",
        "location": "Anna Salai, Chennai",
        "fine_amount": 500,
        "officer_name": "Officer Kumar",
        "status": "Pending",
        "date": datetime.utcnow().isoformat()
    }
]

sample_incidents = [
    {
        "incident_type": "Accident",
        "severity": "High",
        "location": "T Nagar Junction",
        "reported_by": "Traffic Control",
        "description": "Minor collision between two vehicles",
        "status": "Active",
        "vehicles_involved": 2,
        "date": datetime.utcnow().isoformat()
    }
]

sample_parking = [
    {
        "zone_name": "T Nagar Zone A",
        "location": "T Nagar, Chennai",
        "total_slots": 50,
        "occupied_slots": 35,
        "available_slots": 15,
        "hourly_rate": 20,
        "zone_type": "Public"
    }
]

# Insert sample data
db.violations.insert_many(sample_violations)
db.incidents.insert_many(sample_incidents)
db.parking_zones.insert_many(sample_parking)

print("Database initialized with sample data!")