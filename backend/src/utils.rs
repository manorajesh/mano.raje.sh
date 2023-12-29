use log::error;

pub trait LogExpect<T> {
    fn log_expect(self, msg: &str) -> T;
}

impl<T> LogExpect<T> for Option<T> {
    fn log_expect(self, msg: &str) -> T {
        self.unwrap_or_else(|| {
            error!("Option::log_expect failed: {}", msg);
            panic!("Option::log_expect failed: {}", msg);
        })
    }
}

impl<T, E: std::fmt::Debug> LogExpect<T> for Result<T, E> {
    fn log_expect(self, msg: &str) -> T {
        self.unwrap_or_else(|e| {
            error!("Result::log_expect failed: {} - {:?}", msg, e);
            panic!("Result::log_expect failed: {} - {:?}", msg, e);
        })
    }
}
