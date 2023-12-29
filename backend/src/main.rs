mod db;
mod utils;
mod routes;

use actix_web::{ App, HttpServer };
use crate::{ utils::LogExpect, db::init_pool, routes::* };
use actix_cors::Cors;
use log::info;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();

    let pool = init_pool("/app/backend/db/production.db").log_expect("Failed to create pool");

    info!("Starting http server");
    HttpServer::new(move || {
        let cors = Cors::permissive();
        App::new()
            .app_data(pool.clone())
            .wrap(cors)
            .service(get_microblog_posts)
            .service(get_portfolio_posts)
            .service(upsert_microblog_post)
            .service(upsert_portfolio_post)
            .service(delete_microblog_post)
            .service(delete_portfolio_post)
    })
        .bind(("0.0.0.0", 8080))?
        .run().await
}
