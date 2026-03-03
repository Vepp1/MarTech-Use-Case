import sqlite3
import pandas as pd

def add_contact_info(db_path):
    with sqlite3.connect(db_path) as con:
        try:
            print("Database connection successful")
            df = pd.read_sql_query("SELECT DISTINCT user_id, user_email, loyalty_status, country FROM enriched_events WHERE user_id IS NOT NULL", con) # Test query to verify connection
            contact_info = pd.read_json("data/user_contact_details.json") # Load contact info from JSON file
            contact_info = contact_info.rename(columns={"id": "user_id"}) # Rename 'id' to 'user_id' for merging
            df = df.merge(contact_info, left_on="user_id", right_on="user_id", how="left")
            print(df)
        except sqlite3.Error as e: # Handle connection errors
            print(f"Database connection failed: {e}")
            exit(1)

def main():
    add_contact_info("data/events.db")

if __name__ == "__main__":
    main()