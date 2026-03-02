import sqlite3

try:
    con = sqlite3.connect("data/events.db") # Connect to the SQLite database
    print("Database connection successful")
    cur = con.cursor() # Create a cursor to execute SQL commands
    cur.execute("SELECT * FROM enriched_events LIMIT 5") # Execute a sample query
    rows = cur.fetchall()
    for row in rows:
        print(row)
except sqlite3.Error as e: # Handle connection errors
    print(f"Database connection failed: {e}")
    exit(1)