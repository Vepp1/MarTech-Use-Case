import sqlite3
import pandas as pd

def add_contact_info(db_path):
    target_table = "user_contact_enriched"

    with sqlite3.connect(db_path) as con:
        try:
            print("Database connection successful")
            df = pd.read_sql_query("""
                                    WITH ranked AS (
                                        SELECT
                                            user_id,
                                            user_email,
                                            loyalty_status,
                                            country,
                                            ROW_NUMBER() OVER (
                                            PARTITION BY user_id
                                            ORDER BY datetime(enriched_at) DESC, id DESC
                                            ) AS rn
                                        FROM enriched_events
                                        WHERE user_id IS NOT NULL
                                        )
                                        SELECT
                                        user_id,
                                        user_email,
                                        loyalty_status,
                                        country
                                        FROM ranked
                                        WHERE rn = 1
                                    """, con) # Test query to verify connection

            contact_info = pd.read_json("data/user_contact_details.json") # Load contact info from JSON file
            contact_info = contact_info.rename(columns={"id": "user_id"}) # Rename 'id' to 'user_id' for merging

            df = df.merge(contact_info, left_on="user_id", right_on="user_id", how="left")

            for col in ["phone", "salutation"]:
                df[col] = df[col].astype("string").str.strip().replace("", pd.NA) # Replace empty strings with NA

            con.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {target_table} (
                    user_id TEXT PRIMARY KEY,
                    user_email TEXT,
                    loyalty_status TEXT,
                    country TEXT,
                    salutation TEXT,
                    phone TEXT,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            # Write dataframe to a temporary staging table
            df.where(pd.notna(df), None).to_sql("stg_contact", con, if_exists="replace", index=False)

            # Upsert all rows in one SQL statement
            con.execute(f"""
            INSERT INTO {target_table} (
                user_id, user_email, loyalty_status, country, salutation, phone
            )
            SELECT user_id, user_email, loyalty_status, country, salutation, phone
            FROM stg_contact
            WHERE 1=1
            ON CONFLICT(user_id) DO UPDATE SET
                user_email = excluded.user_email,
                loyalty_status = excluded.loyalty_status,
                country = excluded.country,
                salutation = excluded.salutation,
                phone = excluded.phone,
                updated_at = CURRENT_TIMESTAMP
            """)

            con.execute("DROP TABLE IF EXISTS stg_contact")
            print(f"Upserted {len(df)} rows into {target_table}")

        except sqlite3.Error as e: # Handle connection errors
            print(f"Database connection failed: {e}")
            exit(1)

def main():
    add_contact_info("data/events.db")

if __name__ == "__main__":
    main()
