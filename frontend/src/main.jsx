import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, CartProvider, ConfirmProvider } from "./context";
import { Navbar, Footer, RequireAuth, RequireAdmin } from "./components";
import Home from "./pages/Home";
import { Shop, ProductDetail } from "./pages/Shop";
import { About, Services, Gallery, Contact } from "./pages/InfoPages";
import { Login, Register, ForgotPassword, ResetPassword, ChangePassword } from "./pages/AuthPages";
import { Cart, Checkout, MyOrders } from "./pages/CustomerPages";
import Admin from "./pages/Admin";
import "./styles.css";




function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <ConfirmProvider>
          <div className="page">
            <Navbar />
            <main className="content">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/:id" element={<ProductDetail />} />
                <Route path="/services" element={<Services />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/cart" element={<Cart />} />
                <Route
                  path="/change-password"
                  element={<RequireAuth><ChangePassword /></RequireAuth>}
                />
                <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
                <Route path="/my-orders" element={<RequireAuth><MyOrders /></RequireAuth>} />
                <Route path="/admin/*" element={<RequireAdmin><Admin /></RequireAdmin>} />
                <Route path="*" element={<div className="container"><h2>Page not found</h2></div>} />
              </Routes>
            </main>
            <Footer />
          </div>
          </ConfirmProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
