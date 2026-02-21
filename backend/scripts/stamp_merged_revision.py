"""One-off: set alembic_version to merged revision x1y2z3a4b5c6 after replacing 5 migrations with one."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
url = os.getenv("DATABASE_URL")
if not url:
    raise SystemExit("DATABASE_URL not set")
engine = create_engine(url)
with engine.connect() as conn:
    conn.execute(text("UPDATE alembic_version SET version_num = 'x1y2z3a4b5c6'"))
    conn.commit()
print("alembic_version set to x1y2z3a4b5c6")
