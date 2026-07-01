package org.mtrusov.config;

public class InvalidTokenAuthProvider implements AuthProvider {
    @Override
    public String token() {
        return "INVALID_TOKEN";
    }
}
