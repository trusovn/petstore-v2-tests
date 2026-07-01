package org.mtrusov.config;

public class EmptyTokenAuthProvider implements AuthProvider {
    @Override
    public String token() {
        return "";
    }
}
