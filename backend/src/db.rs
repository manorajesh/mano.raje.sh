use log::info;
use serde_json::{ self, Value as JsonValue };
use serde::{ Serialize, Deserialize };
use rusqlite::{ Connection, Result };
use r2d2_sqlite::SqliteConnectionManager;
use std::error::Error;
use r2d2::Pool;
use uuid::Uuid;

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn init_pool(db_url: &str) -> Result<DbPool, Box<dyn Error>> {
    info!("Initializing database pool");
    let manager = SqliteConnectionManager::file(db_url);
    let pool = Pool::new(manager)?;

    // Initialize the database with tables
    info!("Initializing database tables");
    let conn = pool.get()?;
    create_tables(&conn)?;

    info!("Database pool initialized");
    Ok(pool)
}

fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS microblogging_posts (
            id TEXT PRIMARY KEY,
            markdown_content TEXT NOT NULL,
            image_urls TEXT,
            metadata TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        []
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS portfolio_posts (
            id TEXT PRIMARY KEY,
            image_urls TEXT,
            markdown_description TEXT NOT NULL,
            metadata TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        []
    )?;

    Ok(())
}

// Microblog posts

#[derive(Debug, Serialize, Deserialize)]
pub struct MicroblogPost {
    pub id: Option<String>,
    markdown_content: Option<String>,
    image_urls: Option<JsonValue>,
    metadata: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

pub fn upsert_microblog_post(pool: &DbPool, post: &MicroblogPost) -> Result<usize> {
    let conn = pool.get().map_err(|_| rusqlite::Error::InvalidQuery)?;

    let id = &post.id.clone().unwrap_or(Uuid::new_v4().to_string());
    let markdown_content = &post.markdown_content.clone().unwrap_or("".to_string());
    let image_urls = &serde_json::to_string(&post.image_urls).unwrap_or("[]".to_string());
    let metadata = &post.metadata.clone().unwrap_or("".to_string());
    conn.execute(
        "INSERT INTO microblogging_posts (id, markdown_content, image_urls, metadata) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET markdown_content = excluded.markdown_content, 
                                      image_urls = excluded.image_urls, 
                                      metadata = excluded.metadata, 
                                      updated_at = CURRENT_TIMESTAMP",
        &[id, markdown_content, image_urls, metadata]
    )
}

pub fn delete_microblog_post(pool: &DbPool, id: String) -> Result<usize> {
    let conn = pool.get().map_err(|_| rusqlite::Error::InvalidQuery)?;

    conn.execute("DELETE FROM microblogging_posts WHERE id = ?1", &[&id.to_string()])
}

pub fn get_microblog_posts(pool: &DbPool) -> Result<Vec<MicroblogPost>> {
    let conn = pool.get().map_err(|_| rusqlite::Error::InvalidQuery)?;

    let mut stmt = conn.prepare(
        "SELECT id, markdown_content, image_urls, metadata, created_at, updated_at FROM microblogging_posts"
    )?;
    let post_iter = stmt.query_map([], |row| {
        Ok(MicroblogPost {
            id: row.get(0)?,
            markdown_content: row.get(1)?,
            image_urls: serde_json
                ::from_str(&row.get::<_, String>(2)?)
                .map_err(|e| rusqlite::Error::InvalidColumnIndex(e.column()))?,
            metadata: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;

    let mut posts = Vec::new();
    for post in post_iter {
        posts.push(post?);
    }
    Ok(posts)
}

// Portfolio posts

#[derive(Debug, Serialize, Deserialize)]
pub struct PortfolioPost {
    pub id: Option<String>,
    image_urls: Option<JsonValue>,
    markdown_description: Option<String>,
    metadata: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

pub fn upsert_portfolio_post(pool: &DbPool, post: &PortfolioPost) -> Result<usize> {
    let conn = pool.get().map_err(|_| rusqlite::Error::InvalidQuery)?;

    let id = &post.id.clone().unwrap_or(Uuid::new_v4().to_string());
    let image_urls = &serde_json::to_string(&post.image_urls).unwrap_or("[]".to_string());
    let markdown_description = &post.markdown_description.clone().unwrap_or("".to_string());
    let metadata = &post.metadata.clone().unwrap_or("".to_string());
    conn.execute(
        "INSERT INTO portfolio_posts (id, image_urls, markdown_description, metadata) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET image_urls = excluded.image_urls, 
                                      markdown_description = excluded.markdown_description, 
                                      metadata = excluded.metadata, 
                                      updated_at = CURRENT_TIMESTAMP",
        &[id, image_urls, markdown_description, metadata]
    )
}

pub fn delete_portfolio_post(pool: &DbPool, id: String) -> Result<usize> {
    let conn = pool.get().map_err(|_| rusqlite::Error::InvalidQuery)?;

    conn.execute("DELETE FROM portfolio_posts WHERE id = ?1", &[&id.to_string()])
}

pub fn get_portfolio_posts(pool: &DbPool) -> Result<Vec<PortfolioPost>> {
    let conn = pool.get().map_err(|_| rusqlite::Error::InvalidQuery)?;

    let mut stmt = conn.prepare(
        "SELECT id, image_urls, markdown_description, metadata, created_at, updated_at FROM portfolio_posts"
    )?;
    let post_iter = stmt.query_map([], |row| {
        Ok(PortfolioPost {
            id: row.get(0)?,
            image_urls: serde_json
                ::from_str(&row.get::<_, String>(1)?)
                .map_err(|e| rusqlite::Error::InvalidColumnIndex(e.column()))?,
            markdown_description: row.get(2)?,
            metadata: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;

    let mut posts = Vec::new();
    for post in post_iter {
        posts.push(post?);
    }
    Ok(posts)
}
