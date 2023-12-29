use actix_web::{ get, post, HttpResponse, Responder, web };
use crate::db::{ self, DbPool };
use log::{ info, error };

#[get("/api/get-microblog-posts")]
pub async fn get_microblog_posts(pool: web::Data<DbPool>) -> impl Responder {
    info!("Received request to get microblog posts");
    let posts = match db::get_microblog_posts(&pool) {
        Ok(posts) => posts,
        Err(e) => {
            error!("Failed to get microblog posts: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    };
    HttpResponse::Ok().json(posts)
}

#[get("/api/get-portfolio-posts")]
pub async fn get_portfolio_posts(pool: web::Data<DbPool>) -> impl Responder {
    info!("Received request to get portfolio posts");
    let posts = match db::get_portfolio_posts(&pool) {
        Ok(posts) => posts,
        Err(e) => {
            error!("Failed to get portfolio posts: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    };
    HttpResponse::Ok().json(posts)
}

#[post("/api/upsert-microblog-post")]
pub async fn upsert_microblog_post(
    pool: web::Data<DbPool>,
    post: web::Json<db::MicroblogPost>
) -> impl Responder {
    info!("Received request to upsert microblog post");
    match db::upsert_microblog_post(&pool, &post) {
        Ok(_) => HttpResponse::Ok().finish(),
        Err(e) => {
            error!("Failed to upsert microblog post: {}", e);
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[post("/api/upsert-portfolio-post")]
pub async fn upsert_portfolio_post(
    pool: web::Data<DbPool>,
    post: web::Json<db::PortfolioPost>
) -> impl Responder {
    info!("Received request to upsert portfolio post");
    match db::upsert_portfolio_post(&pool, &post) {
        Ok(_) => HttpResponse::Ok().finish(),
        Err(e) => {
            error!("Failed to upsert portfolio post: {}", e);
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[post("/api/delete-microblog-post")]
pub async fn delete_microblog_post(
    pool: web::Data<DbPool>,
    post: web::Json<db::MicroblogPost>
) -> impl Responder {
    info!("Received request to delete microblog post");
    let id = match post.id.clone() {
        Some(id) => id,
        None => {
            return HttpResponse::BadRequest().finish();
        }
    };
    match db::delete_microblog_post(&pool, id) {
        Ok(_) => HttpResponse::Ok().finish(),
        Err(e) => {
            error!("Failed to delete microblog post: {}", e);
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[post("/api/delete-portfolio-post")]
pub async fn delete_portfolio_post(
    pool: web::Data<DbPool>,
    post: web::Json<db::PortfolioPost>
) -> impl Responder {
    info!("Received request to delete portfolio post");
    let id = match post.id.clone() {
        Some(id) => id,
        None => {
            return HttpResponse::BadRequest().finish();
        }
    };
    match db::delete_portfolio_post(&pool, id) {
        Ok(_) => HttpResponse::Ok().finish(),
        Err(e) => {
            error!("Failed to delete portfolio post: {}", e);
            HttpResponse::InternalServerError().finish()
        }
    }
}
