package org.mtrusov.config;

public class TokenAuthProvider implements AuthProvider {
    @Override
    public String token() {
        return "special-key";
    }
}
