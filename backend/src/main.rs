use actix_web::{ get, post, web, App, HttpResponse, HttpServer, Responder };
use actix_cors::Cors;

#[get("/api/hello")]
async fn hello() -> impl Responder {
    println!("hello");
    HttpResponse::Ok().body("Hello world!")
}

#[post("/api/echo")]
async fn echo(req_body: String) -> impl Responder {
    HttpResponse::Ok().body(req_body)
}

async fn manual_hello() -> impl Responder {
    HttpResponse::Ok().body("Hey there!")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        let cors = Cors::permissive();
        App::new()
            .wrap(cors)
            .service(hello)
            .service(echo)
            .route("/api/hey", web::get().to(manual_hello))
    })
        .bind(("0.0.0.0", 8080))?
        .run().await
}
