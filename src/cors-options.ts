// TODO: You should configure root_cors_option before deployment to production
const root_cors_options = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}
export default root_cors_options