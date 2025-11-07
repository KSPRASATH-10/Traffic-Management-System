from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime, timedelta
import os
from collections import defaultdict
from functools import wraps

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.secret_key = 'your-secret-key-change-this-in-production'  # Change this!

# Session Configuration
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True

# CORS Configuration - Allow credentials and specify origin
CORS(app, 
     supports_credentials=True,
     origins=['http://localhost:5000', 'http://127.0.0.1:5000'],
     allow_headers=['Content-Type'],
     expose_headers=['Content-Type'])

# MongoDB Configuration
MONGO_URI = "mongodb://localhost:27017/"
client = MongoClient(MONGO_URI)
db = client['traffic_management_db']

# Collections
violations_collection = db['violations']
incidents_collection = db['incidents']
parking_collection = db['parking_zones']

# Predefined users
USERS = {
    'admin': {
        'password': 'admin123',
        'role': 'admin',
        'name': 'Administrator'
    },
    'officer1': {
        'password': 'officer123',
        'role': 'user',
        'name': 'Traffic Officer 1'
    },
    'officer2': {
        'password': 'officer456',
        'role': 'user',
        'name': 'Traffic Officer 2'
    }
}

# Helper function to serialize MongoDB documents
def serialize_doc(doc):
    if doc and '_id' in doc:
        doc['_id'] = str(doc['_id'])
    return doc

# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return jsonify({'error': 'Unauthorized', 'message': 'Please login first'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Admin-only decorator
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return jsonify({'error': 'Unauthorized', 'message': 'Please login first'}), 401
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function

# ==================== AUTHENTICATION ROUTES ====================

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        
        print(f"Login attempt - Username: {username}")
        
        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400
        
        if username in USERS and USERS[username]['password'] == password:
            session.clear()  # Clear any existing session
            session['username'] = username
            session['role'] = USERS[username]['role']
            session['name'] = USERS[username]['name']
            session.permanent = True  # Make session permanent
            
            print(f"Login successful for {username}, session created: {session}")
            
            response = jsonify({
                'message': 'Login successful',
                'user': {
                    'username': username,
                    'role': USERS[username]['role'],
                    'name': USERS[username]['name']
                }
            })
            
            return response
        else:
            print(f"Login failed for {username} - Invalid credentials")
            return jsonify({'error': 'Invalid credentials'}), 401
    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logout successful'})

@app.route('/api/auth/check', methods=['GET'])
def check_auth():
    print(f"Auth check - Session: {dict(session)}")
    if 'username' in session:
        return jsonify({
            'authenticated': True,
            'user': {
                'username': session['username'],
                'role': session['role'],
                'name': session['name']
            }
        })
    print("Auth check failed - No username in session")
    return jsonify({'authenticated': False}), 401

# ==================== ROUTES FOR HTML PAGES ====================

@app.route('/')
def serve_root():
    # Check if user is logged in
    if 'username' in session:
        print(f"User {session['username']} is logged in, serving dashboard")
        return send_from_directory('templates', 'index.html')
    print("No session found, serving login page")
    return send_from_directory('templates', 'login.html')

@app.route('/login.html')
def login_page():
    return send_from_directory('templates', 'login.html')

@app.route('/index.html')
def index_page():
    # Redirect to root if not logged in
    if 'username' not in session:
        return send_from_directory('templates', 'login.html')
    return send_from_directory('templates', 'index.html')

@app.route('/<path:path>')
def serve_page(path):
    if path.endswith('.html'):
        return send_from_directory('templates', path)
    return send_from_directory('static', path)

# ==================== DASHBOARD API ====================

@app.route('/api/dashboard/stats', methods=['GET'])
@login_required
def get_dashboard_stats():
    try:
        total_violations = violations_collection.count_documents({})
        active_incidents = incidents_collection.count_documents({'status': 'Active'})
        parking_zones = parking_collection.count_documents({})
        
        # Calculate total fines
        pipeline = [
            {'$group': {'_id': None, 'total': {'$sum': '$fine_amount'}}}
        ]
        fines_result = list(violations_collection.aggregate(pipeline))
        total_fines = fines_result[0]['total'] if fines_result else 0
        
        return jsonify({
            'total_violations': total_violations,
            'active_incidents': active_incidents,
            'parking_zones': parking_zones,
            'total_fines': total_fines
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== VIOLATIONS API ====================

@app.route('/api/violations', methods=['GET'])
@login_required
def get_violations():
    try:
        limit = request.args.get('limit', type=int)
        violations = list(violations_collection.find().sort('date', -1))
        
        if limit:
            violations = violations[:limit]
        
        return jsonify([serialize_doc(v) for v in violations])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/violations', methods=['POST'])
@login_required
def add_violation():
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ['vehicle_number', 'violation_type', 'location', 'fine_amount', 'officer_name', 'status']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Add timestamp and created_by
        data['date'] = datetime.utcnow().isoformat()
        data['created_by'] = session['username']
        
        result = violations_collection.insert_one(data)
        
        return jsonify({
            'message': 'Violation added successfully',
            'id': str(result.inserted_id)
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/violations/<violation_id>', methods=['PUT'])
@login_required
def update_violation(violation_id):
    try:
        data = request.json
        data['updated_by'] = session['username']
        data['updated_at'] = datetime.utcnow().isoformat()
        
        violations_collection.update_one(
            {'_id': ObjectId(violation_id)},
            {'$set': data}
        )
        
        return jsonify({'message': 'Violation updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/violations/<violation_id>', methods=['DELETE'])
@admin_required  # Only admin can delete
def delete_violation(violation_id):
    try:
        violations_collection.delete_one({'_id': ObjectId(violation_id)})
        return jsonify({'message': 'Violation deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== INCIDENTS API ====================

@app.route('/api/incidents', methods=['GET'])
@login_required
def get_incidents():
    try:
        status_filter = request.args.get('status')
        limit = request.args.get('limit', type=int)
        
        query = {}
        if status_filter:
            query['status'] = status_filter
        
        incidents = list(incidents_collection.find(query).sort('date', -1))
        
        if limit:
            incidents = incidents[:limit]
        
        return jsonify([serialize_doc(i) for i in incidents])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/incidents', methods=['POST'])
@login_required
def add_incident():
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ['incident_type', 'severity', 'location', 'reported_by', 'description', 'status']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Add timestamp and created_by
        data['date'] = datetime.utcnow().isoformat()
        data['created_by'] = session['username']
        
        result = incidents_collection.insert_one(data)
        
        return jsonify({
            'message': 'Incident reported successfully',
            'id': str(result.inserted_id)
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/incidents/<incident_id>', methods=['PUT'])
@login_required
def update_incident(incident_id):
    try:
        data = request.json
        data['updated_by'] = session['username']
        data['updated_at'] = datetime.utcnow().isoformat()
        
        incidents_collection.update_one(
            {'_id': ObjectId(incident_id)},
            {'$set': data}
        )
        
        return jsonify({'message': 'Incident updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/incidents/<incident_id>', methods=['DELETE'])
@admin_required  # Only admin can delete
def delete_incident(incident_id):
    try:
        incidents_collection.delete_one({'_id': ObjectId(incident_id)})
        return jsonify({'message': 'Incident deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== PARKING API ====================

@app.route('/api/parking', methods=['GET'])
@login_required
def get_parking_zones():
    try:
        zones = list(parking_collection.find())
        return jsonify([serialize_doc(z) for z in zones])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/parking', methods=['POST'])
@login_required
def add_parking_zone():
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ['zone_name', 'location', 'total_slots', 'occupied_slots', 'hourly_rate', 'zone_type']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Calculate available slots
        data['available_slots'] = data['total_slots'] - data['occupied_slots']
        data['created_by'] = session['username']
        
        result = parking_collection.insert_one(data)
        
        return jsonify({
            'message': 'Parking zone added successfully',
            'id': str(result.inserted_id)
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/parking/<zone_id>', methods=['PUT'])
@login_required
def update_parking_zone(zone_id):
    try:
        data = request.json
        
        # Recalculate available slots if needed
        if 'total_slots' in data and 'occupied_slots' in data:
            data['available_slots'] = data['total_slots'] - data['occupied_slots']
        
        data['updated_by'] = session['username']
        data['updated_at'] = datetime.utcnow().isoformat()
        
        parking_collection.update_one(
            {'_id': ObjectId(zone_id)},
            {'$set': data}
        )
        
        return jsonify({'message': 'Parking zone updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/parking/<zone_id>', methods=['DELETE'])
@admin_required  # Only admin can delete
def delete_parking_zone(zone_id):
    try:
        parking_collection.delete_one({'_id': ObjectId(zone_id)})
        return jsonify({'message': 'Parking zone deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== ANALYTICS API ====================

@app.route('/api/analytics', methods=['GET'])
@login_required
def get_analytics():
    try:
        # Violations by type
        violations_by_type = defaultdict(int)
        for v in violations_collection.find():
            violations_by_type[v['violation_type']] += 1
        
        # Violation status distribution
        violation_status = defaultdict(int)
        for v in violations_collection.find():
            violation_status[v['status']] += 1
        
        # Incidents by severity
        incidents_by_severity = defaultdict(int)
        for i in incidents_collection.find():
            incidents_by_severity[i['severity']] += 1
        
        # Monthly fine collection (last 6 months)
        monthly_fines = {}
        for i in range(6):
            month = (datetime.now() - timedelta(days=30*i)).strftime('%b %Y')
            monthly_fines[month] = 0
        
        for v in violations_collection.find():
            try:
                date = datetime.fromisoformat(v['date'].replace('Z', '+00:00'))
                month = date.strftime('%b %Y')
                if month in monthly_fines:
                    monthly_fines[month] += v['fine_amount']
            except:
                pass
        
        # Parking occupancy
        parking_occupancy = {}
        for zone in parking_collection.find():
            parking_occupancy[zone['zone_name']] = {
                'occupied': zone['occupied_slots'],
                'available': zone['available_slots']
            }
        
        # Incident trends (last 7 days)
        incident_trends = {}
        for i in range(7):
            date = (datetime.now() - timedelta(days=i)).strftime('%d %b')
            incident_trends[date] = 0
        
        for incident in incidents_collection.find():
            try:
                date = datetime.fromisoformat(incident['date'].replace('Z', '+00:00'))
                date_str = date.strftime('%d %b')
                if date_str in incident_trends:
                    incident_trends[date_str] += 1
            except:
                pass
        
        # Calculate summary statistics
        total_violations = violations_collection.count_documents({})
        total_fines_pipeline = [
            {'$group': {'_id': None, 'total': {'$sum': '$fine_amount'}}}
        ]
        fines_result = list(violations_collection.aggregate(total_fines_pipeline))
        total_fines = fines_result[0]['total'] if fines_result else 0
        
        avg_fine_pipeline = [
            {'$group': {'_id': None, 'avg': {'$avg': '$fine_amount'}}}
        ]
        avg_result = list(violations_collection.aggregate(avg_fine_pipeline))
        avg_fine = avg_result[0]['avg'] if avg_result else 0
        
        active_incidents = incidents_collection.count_documents({'status': 'Active'})
        total_parking_zones = parking_collection.count_documents({})
        
        total_capacity_pipeline = [
            {'$group': {'_id': None, 'total': {'$sum': '$total_slots'}}}
        ]
        capacity_result = list(parking_collection.aggregate(total_capacity_pipeline))
        total_parking_capacity = capacity_result[0]['total'] if capacity_result else 0
        
        return jsonify({
            'violations_by_type': dict(violations_by_type),
            'violation_status': dict(violation_status),
            'incidents_by_severity': dict(incidents_by_severity),
            'monthly_fines': monthly_fines,
            'parking_occupancy': parking_occupancy,
            'incident_trends': incident_trends,
            'total_violations': total_violations,
            'total_fines': total_fines,
            'avg_fine': round(avg_fine, 2),
            'active_incidents': active_incidents,
            'total_parking_zones': total_parking_zones,
            'total_parking_capacity': total_parking_capacity
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# ==================== RUN APP ====================

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)